import { Asset } from 'expo-asset';
import type { RunFileRequest, RunFileResult } from './ExpoBioscript.types';

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

type GenotypeStore = {
  values: Map<string, string>;
};

type RuntimeContext = {
  files: Map<string, string>;
  genotypeStores: Map<string, GenotypeStore>;
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

  if (request.inputFormat === 'zip' || request.inputFormat === 'cram') {
    throw new Error('expo-bioscript web currently supports text and plain VCF inputs, not zip/cram.');
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

async function loadMontyModule(): Promise<MontyBrowserModule> {
  montyModulePromise ??= import('../web-runtime/monty-wasm32-wasi/monty.wasi-browser.mjs').then((module) => {
    const wasmUrl = Asset.fromModule(
      require('../web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm'),
    ).uri;
    return module.loadMontyWasmModule({
      wasmUrl,
      workerUrl: '/modules/expo-bioscript/web-runtime/monty-wasm32-wasi/wasi-worker-browser.mjs',
    });
  }) as Promise<MontyBrowserModule>;
  return montyModulePromise;
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
      progress = wrapProgress(
        monty,
        snapshot.resume({
          exception: {
            type: err.name || 'RuntimeError',
            message: err.message,
          },
        }),
      );
    }
  }

  return progress.output;
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
  return {
    files,
    genotypeStores: new Map(),
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
    __bioscript_lookup_variant__: (storeId, variant) => lookupVariant(context, storeId, variant),
    __bioscript_lookup_variants__: (storeId, plan) => lookupVariants(context, storeId, plan),
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
  const format = detectInputFormat(path, request.inputFormat);
  if (format === 'zip' || format === 'cram') {
    throw new Error(`web genotype loading does not support ${format} inputs`);
  }

  const content = await readTextFile(context, path);
  const store = format === 'vcf' ? parseVcfGenotypes(content) : parseDelimitedGenotypes(content);
  const storeId = `genotypes:${context.nextStoreId}`;
  context.nextStoreId += 1;
  context.genotypeStores.set(storeId, store);
  return storeId;
}

function lookupVariant(context: RuntimeContext, storeHandle: unknown, variant: unknown): string | null {
  const store = getStore(context, storeHandle);
  const spec = toVariantSpec(variant);
  for (const rsid of spec.rsids) {
    const genotype = store.values.get(rsid);
    if (genotype) {
      return genotype;
    }
  }
  return null;
}

function lookupVariants(context: RuntimeContext, storeHandle: unknown, plan: unknown): Array<string | null> {
  const variants = extractVariantsFromPlan(plan);
  return variants.map((variant) => lookupVariant(context, storeHandle, variant));
}

function getGenotype(context: RuntimeContext, storeHandle: unknown, rsid: string): string | null {
  const store = getStore(context, storeHandle);
  return store.values.get(rsid) ?? null;
}

function writeTsv(context: RuntimeContext, path: string, rows: unknown): null {
  ensureWritablePath(path);
  const normalizedRows = normalizeRows(rows);
  let output = '';
  if (normalizedRows.length > 0) {
    const headers = Object.keys(normalizedRows[0]);
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

function parseDelimitedGenotypes(content: string): GenotypeStore {
  const values = new Map<string, string>();
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const dataLines = lines.filter((line) => !COMMENT_PREFIXES.some((prefix) => line.trimStart().startsWith(prefix)));
  if (dataLines.length === 0) {
    return { values };
  }

  const delimiter = chooseDelimiter(dataLines[0]);
  let headerMap: Record<string, number> | null = null;
  let startIndex = 0;
  const maybeHeader = splitDelimitedLine(dataLines[0], delimiter).map((value) => value.trim().toLowerCase());
  if (looksLikeHeader(maybeHeader)) {
    headerMap = indexHeader(maybeHeader);
    startIndex = 1;
  }

  for (let index = startIndex; index < dataLines.length; index += 1) {
    const parts = splitDelimitedLine(dataLines[index], delimiter).map((value) => value.trim());
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

function parseVcfGenotypes(content: string): GenotypeStore {
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

function getStore(context: RuntimeContext, storeHandle: unknown): GenotypeStore {
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
