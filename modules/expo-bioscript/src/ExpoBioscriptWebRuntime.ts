import { Asset } from 'expo-asset';
import type { GenomeDescriptor, RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import {
  lookupCramVariants,
  lookupVcfVariants,
  type VariantObservation,
  type VariantSpec,
} from './BioscriptWasm';

type MontyBrowserModule = {
  Monty: {
    create(code: string, options?: Record<string, unknown>): unknown;
  };
  MontyException: new (...args: unknown[]) => {
    display?: (format?: string) => string;
    message?: string;
  };
  MontyTypingError: new (...args: unknown[]) => {
    display?: (format?: string, color?: boolean) => string;
    message?: string;
  };
  MontySnapshot: new (...args: unknown[]) => {
    functionName: string;
    args: unknown[];
    kwargs: Record<string, unknown>;
    resume(options: Record<string, unknown>): unknown;
  };
  MontyNameLookup: new (...args: unknown[]) => {
    variableName: string;
    resume(options?: Record<string, unknown>): unknown;
  };
  MontyComplete: new (...args: unknown[]) => {
    output: unknown;
  };
};

type ExternalFunction = (...args: unknown[]) => unknown | Promise<unknown>;

type InMemoryGenotypeStore = {
  values: Map<string, string>;
};

/** What we track per `load_genome` / `load_genotypes` handle. Text/zip use the
 * existing in-memory rsid map; vcf/cram retain the descriptor so
 * `lookup_variants` can batch-dispatch to the bioscript-wasm worker.
 */
type GenomeStore =
  | { kind: 'text'; store: InMemoryGenotypeStore }
  | { kind: 'vcf'; descriptor: Extract<GenomeDescriptor, { kind: 'vcf' }> }
  | { kind: 'cram'; descriptor: Extract<GenomeDescriptor, { kind: 'cram' }> };

type RuntimeContext = {
  files: Map<string, string>;
  genotypeStores: Map<string, GenomeStore>;
  genomes: Map<string, GenomeDescriptor>;
  nextStoreId: number;
};

const COMMENT_PREFIXES = ['#', '//'];
const RSID_ALIASES = ['rsid', 'name', 'snp', 'marker', 'id', 'snpid'];
const GENOTYPE_ALIASES = [
  'genotype',
  'gt',
  'result',
  'results',
  'result1',
  'call',
  'calls',
  'yourcode',
  'code',
  'genotypevalue',
  'variation',
];
const ALLELE1_ALIASES = ['allele1', 'allelea', 'allele_a', 'allele1top'];
const ALLELE2_ALIASES = ['allele2', 'alleleb', 'allele_b', 'allele2top'];

const WEB_SUPPORT_ERROR =
  'expo-bioscript web execution requires cross-origin isolation with SharedArrayBuffer support.';

let montyModulePromise: Promise<MontyBrowserModule> | null = null;

export function isWebRuntimeAvailable(): boolean {
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof SharedArrayBuffer !== 'undefined' &&
    globalThis.crossOriginIsolated === true
  );
}

export async function runFileOnWeb(request: RunFileRequest): Promise<RunFileResult> {
  if (!isWebRuntimeAvailable()) {
    throw new Error(WEB_SUPPORT_ERROR);
  }

  // Web runs through the bioscript-wasm Web Worker for CRAM/VCF; for text it
  // uses the in-memory TS parser. `genomes[name]` descriptors from the UI
  // carry the real File handles + indexes, so a CRAM genome no longer needs
  // `inputFormat: cram` + paths (that path is native-only).
  if (request.inputFormat === 'zip') {
    throw new Error('expo-bioscript web currently supports text / VCF / CRAM inputs, not zip (yet).');
  }
  if (request.autoIndex || request.inputIndex || request.referenceFile || request.referenceIndex || request.cacheDir) {
    throw new Error('expo-bioscript web does not support index/reference-driven native loading paths.');
  }
  if (request.traceReportPath || request.timingReportPath) {
    throw new Error('expo-bioscript web does not support trace/timing report file outputs.');
  }

  const scriptSource = await resolveScriptSource(request);
  const transformedSource = rewriteBioscriptSource(scriptSource);
  const monty = await loadMontyModule();
  const runtimeContext = createRuntimeContext(request);
  const scriptName = request.scriptPath || 'main.py';
  const runner = createMontyRunner(monty, transformedSource, {
    inputs: ['__name__', '__file__', 'input_file', 'output_file', 'participant_id'],
    scriptName,
  });

  await runMontyAsync(monty, runner, {
    inputs: {
      __name__: '__main__',
      __file__: scriptName,
      input_file: request.inputFile ?? null,
      output_file: request.outputFile ?? null,
      participant_id: request.participantId ?? null,
    },
    externalFunctions: createExternalFunctions(runtimeContext, request),
  });

  const outputFiles = Object.fromEntries(runtimeContext.files.entries());
  const outputText = request.outputFile ? runtimeContext.files.get(request.outputFile) : undefined;
  return {
    ok: true,
    outputFiles,
    outputText,
  };
}

// Hand-written loader for the monty WASM bundle. Previously we shipped the
// napi-rs-generated `monty.wasi-browser.mjs` and patched it post-build because
// it used `instantiateNapiModuleSync` — which Chrome refuses for WASM >8 MB on
// the main thread. Now we just call the async variant directly; no generated
// file, no patch script. If napi-rs's import contract ever changes this
// loader has to track the new shape. In exchange the monty submodule stays
// upstream-clean and we own the code path end-to-end.
async function loadMontyModule(): Promise<MontyBrowserModule> {
  montyModulePromise ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDefaultContext, instantiateNapiModule, WASI } = require('@napi-rs/wasm-runtime') as typeof import('@napi-rs/wasm-runtime')

    const wasmUrl = Asset.fromModule(
      require('../web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm'),
    ).uri
    const workerUrl = '/modules/expo-bioscript/web-runtime/monty-wasm32-wasi/wasi-worker-browser.mjs'

    const wasi = new WASI({ version: 'preview1' })
    const context = getDefaultContext()
    const sharedMemory = new WebAssembly.Memory({
      initial: 4000,
      maximum: 65536,
      shared: true,
    })

    const res = await fetch(wasmUrl)
    if (!res.ok) {
      throw new Error(`Failed to fetch monty wasm at ${wasmUrl}: ${res.status}`)
    }
    const bytes = await res.arrayBuffer()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { napiModule } = await instantiateNapiModule(bytes as any, {
      context,
      asyncWorkPoolSize: 4,
      wasi,
      onCreateWorker() {
        return new Worker(workerUrl, { type: 'module' })
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overwriteImports(importObject: any) {
        importObject.env = {
          ...importObject.env,
          ...importObject.napi,
          ...importObject.emnapi,
          memory: sharedMemory,
        }
        return importObject
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeInit({ instance }: { instance: any }) {
        for (const name of Object.keys(instance.exports)) {
          if (name.startsWith('__napi_register__')) {
            instance.exports[name]()
          }
        }
      },
    })

    return napiModule.exports as unknown as MontyBrowserModule
  })()
  return montyModulePromise
}

function createMontyRunner(
  monty: MontyBrowserModule,
  code: string,
  options: Record<string, unknown>,
): { start(options?: Record<string, unknown>): unknown } {
  const result = monty.Monty.create(code, options);
  if (result instanceof monty.MontyException) {
    throw new Error(formatMontyError(result));
  }
  if (result instanceof monty.MontyTypingError) {
    throw new Error(formatMontyTypingError(result));
  }
  return result as { start(options?: Record<string, unknown>): unknown };
}

async function runMontyAsync(
  monty: MontyBrowserModule,
  runner: { start(options?: Record<string, unknown>): unknown },
  options: {
    inputs: Record<string, unknown>;
    externalFunctions: Record<string, ExternalFunction>;
  },
): Promise<unknown> {
  let progress = wrapProgress(monty, runner.start({ inputs: options.inputs }));

  while (!(progress instanceof monty.MontyComplete)) {
    if (progress instanceof monty.MontyNameLookup) {
      const extFunction = options.externalFunctions[progress.variableName];
      progress = wrapProgress(monty, extFunction ? progress.resume({ value: extFunction }) : progress.resume());
      continue;
    }

    const snapshot = progress as InstanceType<MontyBrowserModule['MontySnapshot']>;
    const extFunction = options.externalFunctions[snapshot.functionName];
    if (!extFunction) {
      progress = wrapProgress(
        monty,
        snapshot.resume({
          exception: {
            type: 'NameError',
            message: `name '${snapshot.functionName}' is not defined`,
          },
        }),
      );
      continue;
    }

    try {
      const kwargs = snapshot.kwargs ?? {};
      let result: unknown;
      if (Object.keys(kwargs).length > 0) {
        result = extFunction(...snapshot.args, kwargs);
      } else {
        result = extFunction(...snapshot.args);
      }
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        result = await result;
      }
      progress = wrapProgress(monty, snapshot.resume({ returnValue: result }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Monty only accepts Python-exception names here (RuntimeError,
      // ValueError, …) — a JS default `Error` is rejected with
      // "Invalid exception type: 'Error'", which masks the real message.
      // Map anything unknown to RuntimeError so the root cause surfaces.
      const pythonExcType = mapJsErrorToPythonException(err);
      // eslint-disable-next-line no-console
      console.error(
        `[bioscript-web] external function '${snapshot.functionName}' threw ${err.name || 'Error'}: ${err.message}`,
        err.stack,
      );
      progress = wrapProgress(
        monty,
        snapshot.resume({
          exception: {
            type: pythonExcType,
            message: err.message,
          },
        }),
      );
    }
  }

  return progress.output;
}

const PYTHON_EXCEPTION_NAMES = new Set([
  'Exception',
  'BaseException',
  'ArithmeticError',
  'OverflowError',
  'ZeroDivisionError',
  'LookupError',
  'IndexError',
  'KeyError',
  'RuntimeError',
  'NotImplementedError',
  'RecursionError',
  'AttributeError',
  'FrozenInstanceError',
  'NameError',
  'UnboundLocalError',
  'ValueError',
  'UnicodeDecodeError',
  'ImportError',
  'ModuleNotFoundError',
  'OSError',
  'FileNotFoundError',
  'FileExistsError',
  'IsADirectoryError',
  'NotADirectoryError',
  'PermissionError',
  'AssertionError',
  'MemoryError',
  'StopIteration',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
]);

function mapJsErrorToPythonException(err: Error): string {
  const name = err.name;
  if (name && PYTHON_EXCEPTION_NAMES.has(name)) return name;
  switch (name) {
    case 'RangeError':
      return 'ValueError';
    case 'URIError':
    case 'SyntaxError':
      return 'SyntaxError';
    case 'ReferenceError':
      return 'NameError';
    default:
      return 'RuntimeError';
  }
}

function wrapProgress(monty: MontyBrowserModule, value: unknown): unknown {
  if (value instanceof monty.MontyException) {
    throw new Error(formatMontyError(value));
  }
  if (value instanceof monty.MontyTypingError) {
    throw new Error(formatMontyTypingError(value));
  }
  return value;
}

function formatMontyError(error: { display?: (format?: string) => string; message?: string }): string {
  return error.display?.('type-msg') ?? error.message ?? 'Monty runtime error';
}

function formatMontyTypingError(error: { display?: (format?: string, color?: boolean) => string; message?: string }): string {
  return error.display?.('full', false) ?? error.message ?? 'Monty typing error';
}

function createRuntimeContext(request: RunFileRequest): RuntimeContext {
  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(request.fileContents ?? {})) {
    files.set(path, content);
  }
  if (request.inputFile && request.inputContents !== undefined) {
    files.set(request.inputFile, request.inputContents);
  }
  if (request.scriptContents !== undefined) {
    files.set(request.scriptPath, request.scriptContents);
  }
  const genomes = new Map<string, GenomeDescriptor>();
  for (const [name, descriptor] of Object.entries(request.genomes ?? {})) {
    genomes.set(name, descriptor);
  }
  return {
    files,
    genotypeStores: new Map(),
    genomes,
    nextStoreId: 1,
  };
}

async function resolveScriptSource(request: RunFileRequest): Promise<string> {
  if (request.scriptContents !== undefined) {
    return request.scriptContents;
  }
  const fromFiles = request.fileContents?.[request.scriptPath];
  if (fromFiles !== undefined) {
    return fromFiles;
  }
  return readSourceFromPath(request.scriptPath);
}

function createExternalFunctions(
  context: RuntimeContext,
  request: RunFileRequest,
): Record<string, ExternalFunction> {
  return {
    __bioscript_variant__: (...args) => createVariantSpec(args),
    __bioscript_query_plan__: (variants) => new Map([['variants', variants]]),
    __bioscript_load_genotypes__: async (path) => loadGenotypes(context, request, expectString(path, 'load_genotypes')),
    __bioscript_load_genome__: async (handle) => loadGenome(context, request, expectString(handle, 'load_genome')),
    __bioscript_lookup_variant__: async (storeId, variant) => lookupVariant(context, storeId, variant),
    __bioscript_lookup_variants__: async (storeId, plan) => lookupVariantsDispatch(context, storeId, plan),
    __bioscript_get__: (storeId, rsid) => getGenotype(context, storeId, expectString(rsid, 'get')),
    __bioscript_write_tsv__: (path, rows) => writeTsv(context, expectString(path, 'write_tsv'), rows),
    __bioscript_read_text__: async (path) => readTextFile(context, expectString(path, 'read_text')),
    __bioscript_write_text__: (path, text) => writeTextFile(context, expectString(path, 'write_text'), expectString(text, 'write_text')),
  };
}

function rewriteBioscriptSource(code: string): string {
  return code
    .replace(/\bbioscript\.variant\s*\(/g, '__bioscript_variant__(')
    .replace(/\bbioscript\.query_plan\s*\(/g, '__bioscript_query_plan__(')
    .replace(/\bbioscript\.load_genotypes\s*\(/g, '__bioscript_load_genotypes__(')
    .replace(/\bbioscript\.load_genome\s*\(/g, '__bioscript_load_genome__(')
    .replace(/\bbioscript\.write_tsv\s*\(/g, '__bioscript_write_tsv__(')
    .replace(/\bbioscript\.read_text\s*\(/g, '__bioscript_read_text__(')
    .replace(/\bbioscript\.write_text\s*\(/g, '__bioscript_write_text__(')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.lookup_variant\s*\(/g, '__bioscript_lookup_variant__($1, ')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.lookup_variants\s*\(/g, '__bioscript_lookup_variants__($1, ')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.get\s*\(/g, '__bioscript_get__($1, ');
}

function createVariantSpec(args: unknown[]): Map<string, unknown> {
  const kwargs = extractKwargs(args);
  const rsids = normalizeStringList(kwargs.rsid ?? kwargs.rsids);
  const variant = new Map<string, unknown>();
  variant.set('rsids', rsids);
  variant.set('grch37', normalizeOptionalString(kwargs.grch37));
  variant.set('grch38', normalizeOptionalString(kwargs.grch38));
  variant.set('reference', normalizeOptionalString(kwargs.ref ?? kwargs.reference));
  variant.set('alternate', normalizeOptionalString(kwargs.alt ?? kwargs.alternate));
  variant.set('kind', normalizeOptionalString(kwargs.kind));
  variant.set('deletion_length', normalizeOptionalNumber(kwargs.deletion_length));
  variant.set('motifs', normalizeStringList(kwargs.motifs));
  return variant;
}

async function loadGenotypes(context: RuntimeContext, request: RunFileRequest, path: string): Promise<string> {
  // If the UI registered a rich descriptor under this name, dispatch to the
  // new-style handle path. `bioscript.load_genotypes` stays supported for
  // back-compat with older scripts.
  if (context.genomes.has(path)) {
    return loadGenome(context, request, path);
  }
  const format = detectInputFormat(path, request.inputFormat);
  if (format === 'zip' || format === 'cram') {
    throw new Error(`web genotype loading does not support ${format} inputs without a genome descriptor`);
  }

  const content = await readTextFile(context, path);
  const textStore = format === 'vcf' ? parseVcfGenotypes(content) : parseDelimitedGenotypes(content);
  const storeId = `genotypes:${context.nextStoreId}`;
  context.nextStoreId += 1;
  context.genotypeStores.set(storeId, { kind: 'text', store: textStore });
  // eslint-disable-next-line no-console
  console.log(
    '[bioscript-web] load_genotypes ' +
      JSON.stringify({
        path,
        format,
        contentLength: content.length,
        rsidCount: textStore.values.size,
        sampleRsids: Array.from(textStore.values.keys()).slice(0, 5),
      }),
  );
  return storeId;
}

async function loadGenome(
  context: RuntimeContext,
  _request: RunFileRequest,
  handle: string,
): Promise<string> {
  const descriptor = context.genomes.get(handle);
  if (!descriptor) {
    throw new Error(
      `bioscript.load_genome('${handle}'): no such genome was registered — did the UI forget to pass it?`,
    );
  }
  const storeId = `genome:${context.nextStoreId}`;
  context.nextStoreId += 1;

  if (descriptor.kind === 'text' || descriptor.kind === 'zip') {
    // Text-shaped descriptors share the same rsid-map backend as load_genotypes.
    const textStore = parseDelimitedGenotypes(descriptor.text);
    context.genotypeStores.set(storeId, { kind: 'text', store: textStore });
    // eslint-disable-next-line no-console
    console.log(`[bioscript-web] load_genome text ${handle} (${textStore.values.size} rsids)`);
    return storeId;
  }

  if (descriptor.kind === 'vcf') {
    context.genotypeStores.set(storeId, { kind: 'vcf', descriptor });
    // eslint-disable-next-line no-console
    console.log(`[bioscript-web] load_genome vcf ${handle} (${descriptor.vcfFile.name})`);
    return storeId;
  }

  if (descriptor.kind === 'cram') {
    context.genotypeStores.set(storeId, { kind: 'cram', descriptor });
    // eslint-disable-next-line no-console
    console.log(`[bioscript-web] load_genome cram ${handle} (${descriptor.cramFile.name})`);
    return storeId;
  }

  throw new Error(`unknown genome descriptor kind`);
}

async function lookupVariant(
  context: RuntimeContext,
  storeHandle: unknown,
  variant: unknown,
): Promise<string | null> {
  const store = getStore(context, storeHandle);
  if (store.kind === 'text') {
    const spec = toVariantSpec(variant);
    for (const rsid of spec.rsids) {
      const genotype = store.store.values.get(rsid);
      if (genotype) return genotype;
    }
    return null;
  }
  // VCF / CRAM: single-variant lookup uses the same wasm path as batch.
  const results = await lookupVariantsDispatch(context, storeHandle, [variant]);
  return results[0] ?? null;
}

async function lookupVariantsDispatch(
  context: RuntimeContext,
  storeHandle: unknown,
  plan: unknown,
): Promise<Array<string | null>> {
  const store = getStore(context, storeHandle);
  const variants = extractVariantsFromPlan(plan);

  if (store.kind === 'text') {
    return variants.map((variant) => {
      const spec = toVariantSpec(variant);
      for (const rsid of spec.rsids) {
        const genotype = store.store.values.get(rsid);
        if (genotype) return genotype;
      }
      return null;
    });
  }

  // VCF / CRAM: translate every Monty-side VariantSpec into a wasm VariantSpec
  // and batch through the Web Worker. Preserve plan order — apol1 depends on
  // destructuring `site1, site2, g2 = lookup_variants(PLAN)`.
  const wasmVariants: VariantSpec[] = variants.map((raw, index) =>
    wasmVariantFromMontySpec(raw, index, store),
  );

  const result =
    store.kind === 'vcf'
      ? await lookupVcfVariants({
          vcfFile: store.descriptor.vcfFile,
          tbiBytes: store.descriptor.tbiBytes,
          variants: wasmVariants,
        })
      : await lookupCramVariants({
          cramFile: store.descriptor.cramFile,
          craiBytes: store.descriptor.craiBytes,
          fastaFile: store.descriptor.fastaFile,
          faiBytes: store.descriptor.faiBytes,
          variants: wasmVariants,
        });

  // eslint-disable-next-line no-console
  console.log(
    `[bioscript-web] lookup_variants ${store.kind} · ${variants.length} variants · ${result.durationMs}ms`,
  );

  return result.observations.map((obs) => observationToGenotype(obs));
}

function wasmVariantFromMontySpec(raw: unknown, index: number, store: GenomeStore): VariantSpec {
  const rec = toRecord(raw);
  const rsids = normalizeStringList(rec.rsids);
  const rsid = rsids[0];

  // Prefer the assembly the descriptor's file is on, but we don't know that
  // without inspecting; try grch38 first, fall back to grch37. The wasm
  // resolver is chrom-name-agnostic (handles chr22 vs 22).
  const grch38 = parseLocusString(rec.grch38);
  const grch37 = parseLocusString(rec.grch37);
  const preferred = grch38 ?? grch37;
  if (!preferred) {
    throw new Error(
      `lookup_variants: variant #${index}${rsid ? ` (${rsid})` : ''} has no grch37/grch38 coordinate`,
    );
  }
  const assembly = grch38 ? 'grch38' : 'grch37';
  const ref = normalizeOptionalString(rec.reference);
  const alt = normalizeOptionalString(rec.alternate);
  if (!ref || !alt) {
    throw new Error(
      `lookup_variants: variant #${index}${rsid ? ` (${rsid})` : ''} is missing ref/alt — CRAM/VCF lookup requires explicit alleles`,
    );
  }
  return {
    name: rsid ?? `variant_${index}`,
    chrom: preferred.chrom,
    pos: preferred.pos,
    ref,
    alt,
    rsid,
    assembly,
    // Store kind is informational only; worker picks backend from caller.
    // (store parameter retained for symmetry / future per-genome assembly hint.)
    ...(store.kind === 'cram' ? {} : {}),
  };
}

function parseLocusString(value: unknown): { chrom: string; pos: number } | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  // Accept "22:36661906" or "22:36661906-36661906" — use the start position.
  const match = raw.match(/^([^:]+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  const chrom = match[1]!.trim();
  const pos = Number.parseInt(match[2]!, 10);
  if (!chrom || !Number.isFinite(pos)) return null;
  return { chrom, pos };
}

function observationToGenotype(obs: VariantObservation): string | null {
  // The Python contract (apol1.py etc.) is `(string | null)[]` — string for
  // "we observed a genotype", null for "nothing found or unsupported". Emit
  // the genotype directly; callers like apol1 inspect char-by-char.
  return obs.genotype ?? null;
}

function getGenotype(context: RuntimeContext, storeHandle: unknown, rsid: string): string | null {
  const store = getStore(context, storeHandle);
  if (store.kind !== 'text') {
    throw new Error(
      `bioscript.get(rsid) is only supported on text genotype stores — use lookup_variant(s) with a query plan for VCF/CRAM instead`,
    );
  }
  return store.store.values.get(rsid) ?? null;
}

function writeTsv(context: RuntimeContext, path: string, rows: unknown): null {
  ensureWritablePath(path);
  const normalizedRows = normalizeRows(rows);
  let output = '';
  if (normalizedRows.length > 0) {
    const firstRow = normalizedRows[0]!;
    const headers = Object.keys(firstRow);
    output += `${headers.join('\t')}\n`;
    for (const row of normalizedRows) {
      output += `${headers.map((header) => stringifyValue(row[header])).join('\t')}\n`;
    }
  }
  context.files.set(path, output);
  return null;
}

async function readTextFile(context: RuntimeContext, path: string): Promise<string> {
  if (context.files.has(path)) {
    return context.files.get(path) as string;
  }
  const text = await readSourceFromPath(path);
  context.files.set(path, text);
  return text;
}

function writeTextFile(context: RuntimeContext, path: string, text: string): null {
  ensureWritablePath(path);
  context.files.set(path, text);
  return null;
}

async function readSourceFromPath(path: string): Promise<string> {
  if (!isFetchableUrl(path)) {
    throw new Error(`web runtime cannot read local path '${path}' without in-memory contents`);
  }
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`failed to fetch '${path}': ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function isFetchableUrl(path: string): boolean {
  return /^(https?:|blob:|data:)/i.test(path);
}

function ensureWritablePath(path: string): void {
  if (isFetchableUrl(path)) {
    throw new Error(`cannot write to URL-backed path '${path}' on web`);
  }
  if (path.startsWith('/') || path.includes('..')) {
    throw new Error(`web runtime only supports sandboxed relative output paths, got '${path}'`);
  }
}

function detectInputFormat(path: string, requested?: string): 'text' | 'vcf' | 'zip' | 'cram' {
  const normalized = requested?.toLowerCase();
  if (normalized === 'text' || normalized === 'vcf' || normalized === 'zip' || normalized === 'cram') {
    return normalized;
  }
  const lower = path.toLowerCase();
  if (lower.endsWith('.vcf')) {
    return 'vcf';
  }
  if (lower.endsWith('.zip')) {
    return 'zip';
  }
  if (lower.endsWith('.cram')) {
    return 'cram';
  }
  return 'text';
}

function parseDelimitedGenotypes(content: string): InMemoryGenotypeStore {
  const values = new Map<string, string>();
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const dataLines = lines.filter((line) => !COMMENT_PREFIXES.some((prefix) => line.trimStart().startsWith(prefix)));
  if (dataLines.length === 0) {
    return { values };
  }

  const firstLine = dataLines[0]!;
  const delimiter = chooseDelimiter(firstLine);
  let headerMap: Record<string, number> | null = null;
  let startIndex = 0;
  const maybeHeader = splitDelimitedLine(firstLine, delimiter).map((value) => value.trim().toLowerCase());
  if (looksLikeHeader(maybeHeader)) {
    headerMap = indexHeader(maybeHeader);
    startIndex = 1;
  }

  for (let index = startIndex; index < dataLines.length; index += 1) {
    const line = dataLines[index]!;
    const parts = splitDelimitedLine(line, delimiter).map((value) => value.trim());
    if (parts.length === 0) {
      continue;
    }
    const rsid = readDelimitedValue(parts, headerMap, RSID_ALIASES) ?? parts[0];
    if (!rsid || !rsid.toLowerCase().startsWith('rs')) {
      continue;
    }
    const genotype =
      readDelimitedValue(parts, headerMap, GENOTYPE_ALIASES) ??
      joinAlleles(
        readDelimitedValue(parts, headerMap, ALLELE1_ALIASES),
        readDelimitedValue(parts, headerMap, ALLELE2_ALIASES),
      ) ??
      parts[parts.length - 1];
    if (genotype) {
      values.set(rsid, genotype);
    }
  }

  return { values };
}

function parseVcfGenotypes(content: string): InMemoryGenotypeStore {
  const values = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('##') || trimmed.startsWith('#CHROM')) {
      continue;
    }
    const fields = trimmed.split('\t');
    if (fields.length < 10) {
      continue;
    }
    const rsid = fields[2]?.trim();
    const reference = fields[3]?.trim();
    const alternates = fields[4]
      ?.split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value !== '.');
    if (!rsid || rsid === '.' || !reference || !alternates || alternates.length === 0) {
      continue;
    }
    const sampleGt = fields[9]?.split(':')[0] ?? '.';
    const genotype = genotypeFromVcfGt(sampleGt, reference, alternates);
    if (genotype) {
      values.set(rsid, genotype);
    }
  }
  return { values };
}

function genotypeFromVcfGt(sampleGt: string, reference: string, alternates: string[]): string | null {
  if (!sampleGt || sampleGt === '.' || sampleGt === './.' || sampleGt === '.|.') {
    return null;
  }
  const alleles = sampleGt.split(/[\/|]/).map((value) => value.trim());
  if (alleles.length === 0) {
    return null;
  }
  const resolved = alleles.map((allele) => {
    if (allele === '.' || allele.length === 0) {
      return '';
    }
    const index = Number.parseInt(allele, 10);
    if (!Number.isFinite(index)) {
      return '';
    }
    if (index === 0) {
      return reference;
    }
    return alternates[index - 1] ?? '';
  });
  return resolved.every((allele) => allele.length > 0) ? resolved.join('') : null;
}

function chooseDelimiter(line: string): string | RegExp {
  if (line.includes('\t')) {
    return '\t';
  }
  if (line.includes(',')) {
    return ',';
  }
  return /\s+/;
}

function splitDelimitedLine(line: string, delimiter: string | RegExp): string[] {
  return line.split(delimiter).filter((value) => value.length > 0);
}

function looksLikeHeader(values: string[]): boolean {
  return values.some((value) => RSID_ALIASES.includes(value) || GENOTYPE_ALIASES.includes(value));
}

function indexHeader(values: string[]): Record<string, number> {
  const header: Record<string, number> = {};
  values.forEach((value, index) => {
    header[value] = index;
  });
  return header;
}

function readDelimitedValue(
  parts: string[],
  headerMap: Record<string, number> | null,
  aliases: string[],
): string | null {
  if (!headerMap) {
    return null;
  }
  for (const alias of aliases) {
    const index = headerMap[alias];
    if (index !== undefined && parts[index]) {
      return parts[index];
    }
  }
  return null;
}

function joinAlleles(first: string | null, second: string | null): string | null {
  if (!first || !second) {
    return null;
  }
  return `${first}${second}`;
}

function getStore(context: RuntimeContext, storeHandle: unknown): GenomeStore {
  const key = expectString(storeHandle, 'genotype store');
  const store = context.genotypeStores.get(key);
  if (!store) {
    throw new Error(`unknown genotype handle '${key}'`);
  }
  return store;
}

function extractVariantsFromPlan(plan: unknown): unknown[] {
  if (Array.isArray(plan)) {
    return plan;
  }
  const record = toRecord(plan);
  const variants = record.variants;
  return Array.isArray(variants) ? variants : [];
}

function toVariantSpec(value: unknown): { rsids: string[] } {
  const record = toRecord(value);
  return {
    rsids: normalizeStringList(record.rsids),
  };
}

function normalizeRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) {
    throw new Error('write_tsv expects a list of rows');
  }
  return rows.map((row) => toRecord(row));
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('expected mapping value');
}

function extractKwargs(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) {
    return {};
  }
  const last = args[args.length - 1];
  if (last instanceof Map) {
    return Object.fromEntries(last.entries());
  }
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    return last as Record<string, unknown>;
  }
  return {};
}

function normalizeStringList(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [String(value)];
}

function normalizeOptionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Map) {
    return JSON.stringify(Object.fromEntries(value.entries()));
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}
