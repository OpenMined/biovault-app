import { readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import YAML from 'yaml';

import type { RunAssayRequest, RunFileRequest, RunFileResult } from './ExpoBioscript.types';
import ExpoBioscriptModule from './ExpoBioscriptModule';

const assayResultSchema = require('../../../bioscript/assay_result_schema.json') as {
  outcomeField?: unknown;
};

const ASSAY_OUTCOME_FIELD =
  typeof assayResultSchema.outcomeField === 'string' && assayResultSchema.outcomeField
    ? assayResultSchema.outcomeField
    : 'assay_outcome';

type VariantDefinition = {
  gene?: string;
  label: string;
  location?: string;
  note?: string;
  alts?: string[];
  name: string;
  fields: Record<string, string | number | string[] | undefined>;
};

type LoadedAssayPackage = {
  implementationKind: 'panel' | 'script';
  outputFile: string;
  scriptPath: string;
  scriptContents: string;
  bundledFiles: Record<string, string>;
  unsupportedVariants: Array<{ variantName: string; target: string; reason: string }>;
};

function isFetchableUrl(path: string): boolean {
  return /^(https?:|blob:|data:)/i.test(path);
}

async function readTextSource(path: string): Promise<string> {
  if (Platform.OS === 'web') {
    if (!isFetchableUrl(path)) {
      throw new Error(`expo-bioscript cannot fetch non-URL assay asset '${path}' on web without in-memory contents`);
    }
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`failed to fetch '${path}': ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  return readAsStringAsync(path);
}

function splitPath(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = splitPath(normalized);
  if (parts.length <= 1) {
    return normalized.startsWith('/') ? '/' : '';
  }
  const prefix = normalized.startsWith('/') ? '/' : '';
  return `${prefix}${parts.slice(0, -1).join('/')}`;
}

function joinPath(base: string, relative: string): string {
  if (/^(https?:|blob:|data:|file:)/i.test(relative) || relative.startsWith('/')) {
    return relative;
  }
  if (isFetchableUrl(base)) {
    return new URL(relative, base.endsWith('/') ? base : `${base}/`).toString();
  }
  const prefix = base.startsWith('/') ? '/' : '';
  const stack = splitPath(base);
  for (const segment of splitPath(relative)) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return `${prefix}${stack.join('/')}`;
}

function getYamlString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(label);
  }
  return value;
}

function readYamlMap(text: string, label: string): Record<string, unknown> {
  const data = YAML.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} did not contain a YAML mapping`);
  }
  return data as Record<string, unknown>;
}

function formatCoord(coords: Record<string, unknown> | null | undefined): string | undefined {
  if (!coords) {
    return undefined;
  }
  const chrom = typeof coords.chrom === 'string' ? coords.chrom : undefined;
  if (!chrom) {
    return undefined;
  }
  const pos = typeof coords.pos === 'number' ? coords.pos : undefined;
  const start = typeof coords.start === 'number' ? coords.start : undefined;
  const end = typeof coords.end === 'number' ? coords.end : undefined;
  if (pos !== undefined) {
    return `${chrom}:${pos}-${pos}`;
  }
  if (start !== undefined && end !== undefined) {
    return `${chrom}:${start}-${end}`;
  }
  if (start !== undefined) {
    return `${chrom}:${start}-${start}`;
  }
  return undefined;
}

function compiledVariantToDefinition(path: string, data: Record<string, unknown>): VariantDefinition {
  const fields = (data.fields as Record<string, unknown> | undefined) ?? {};
  const rsids = Array.isArray(data.rsids) ? data.rsids.filter((item): item is string => typeof item === 'string') : [];
  const alts = Array.isArray(data.alts) ? data.alts.filter((item): item is string => typeof item === 'string') : [];
  const grch37 = formatCoord(data.grch37 as Record<string, unknown> | undefined) ?? (typeof fields.grch37 === 'string' ? fields.grch37 : undefined);
  const grch38 = formatCoord(data.grch38 as Record<string, unknown> | undefined) ?? (typeof fields.grch38 === 'string' ? fields.grch38 : undefined);
  const ref = typeof data.ref === 'string' ? data.ref : typeof fields.ref === 'string' ? fields.ref : undefined;
  const deletionLength =
    typeof data.deletion_length === 'number'
      ? data.deletion_length
      : typeof fields.deletion_length === 'number'
        ? fields.deletion_length
        : undefined;
  const rawKind =
    typeof fields.kind === 'string'
      ? fields.kind
      : typeof data.kind === 'string'
        ? data.kind
        : 'snv';
  const kindMap: Record<string, string> = { snv: 'snp', deletion: 'deletion', insertion: 'insertion', indel: 'indel' };
  const kind = kindMap[String(rawKind).toLowerCase()] ?? String(rawKind).toLowerCase();
  const alt = typeof fields.alt === 'string' ? fields.alt : alts[0];
  const note = typeof data.note === 'string' ? data.note : typeof data.summary === 'string' ? data.summary : undefined;
  const gene = typeof data.gene === 'string' ? data.gene : undefined;
  const variantNameSource = typeof data.name === 'string' && data.name ? data.name : path.split('/').pop() ?? 'variant';
  const name = variantNameSource.replace(/[^A-Za-z0-9_]/g, '_');
  const location = grch37
    ? `GRCh37 chr${grch37.split(':')[0]}:${grch37.split(':')[1]?.replace(/-.+$/, '') ?? ''}`
    : grch38
      ? `GRCh38 chr${grch38.split(':')[0]}:${grch38.split(':')[1]?.replace(/-.+$/, '') ?? ''}`
      : undefined;

  return {
    gene,
    label: rsids[0] ?? name,
    location,
    note,
    alts: alts.length ? alts : undefined,
    name,
    fields: {
      rsid: rsids.length === 1 ? rsids[0] : rsids.length ? rsids : undefined,
      grch37,
      grch38,
      ref,
      alt,
      kind,
      deletion_length: deletionLength,
    },
  };
}

function formatVariantTarget(variant: VariantDefinition): string {
  const rsid = Array.isArray(variant.fields.rsid) ? variant.fields.rsid.join('/') : String(variant.fields.rsid ?? '');
  const ref = String(variant.fields.ref ?? '');
  const alt = String(variant.fields.alt ?? '');
  const kind = String(variant.fields.kind ?? '');
  if (ref || alt) {
    return `${rsid} ${ref}>${alt}${kind && kind !== 'snp' ? ` (${kind})` : ''}`.trim();
  }
  return rsid || variant.name;
}

function bioscriptLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => bioscriptLiteral(item)).join(', ')}]`;
  }
  throw new Error(`unsupported bioscript literal: ${String(value)}`);
}

function buildProbeScript(variants: VariantDefinition[], progressFile?: string): string {
  const lookupBatchSize = 512;
  const blocks = variants
    .map((variant) => {
      const args = Object.entries(variant.fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `    ${key === 'deletion_length' ? 'deletion_length' : key}=${bioscriptLiteral(value)}`)
        .join(',\n');
      return `${variant.name} = bioscript.variant(\n${args}\n)\n`;
    })
    .join('\n');

  const totalVariants = variants.length;
  const chunkBlocks: string[] = [];
  for (let chunkStart = 0; chunkStart < variants.length; chunkStart += lookupBatchSize) {
    const chunk = variants.slice(chunkStart, chunkStart + lookupBatchSize);
    const chunkEnd = chunkStart + chunk.length;
    const planName = `QUERY_PLAN_${chunkStart}`;
    const resultsName = `observations_${chunkStart}`;
    const variantRefs = chunk.map((variant) => variant.name).join(', ');
    const rowBlocks = chunk
      .map((variant, index) => {
        const observationExpr = `${resultsName}[${index}]`;
        return `    row_status_${variant.name} = row_status(${observationExpr}, ${variant.name})\n    rows.append({\n        "participant_id": participant_id,\n        "gene": ${bioscriptLiteral(variant.gene ?? 'Unknown')},\n        "label": ${bioscriptLiteral(variant.label)},\n        "rsid": ${bioscriptLiteral(variant.fields.rsid ?? null)},\n        "location": ${bioscriptLiteral(variant.location ?? null)},\n        "kind": ${bioscriptLiteral(String(variant.fields.kind ?? 'snp').toUpperCase())},\n        "ref": ${bioscriptLiteral(variant.fields.ref ?? null)},\n        "alts": ${bioscriptLiteral(variant.alts ?? [])},\n        "observed": ${observationExpr},\n        "row_status": row_status_${variant.name},\n        "summary": ${bioscriptLiteral(variant.note ?? '')},\n    })`;
      })
      .join('\n');
    chunkBlocks.push(
      `    ${planName} = bioscript.query_plan([${variantRefs}])\n` +
        `    ${resultsName} = genotypes.lookup_variants(${planName})\n` +
        `${rowBlocks}\n` +
        `    write_progress("running_variants", ${chunkEnd}, ${bioscriptLiteral(`Processed ${chunkEnd} of ${totalVariants} variants`)})`
    );
  }
  const rows = chunkBlocks.join('\n');

  return `${blocks}\n\nPROGRESS_FILE = ${bioscriptLiteral(progressFile ?? null)}\nTOTAL_VARIANTS = ${totalVariants}\n\n\ndef write_progress(phase, completed=None, detail=None):\n    if PROGRESS_FILE is None:\n        return\n    completed_value = "" if completed is None else str(completed)\n    detail_value = "" if detail is None else detail\n    bioscript.write_text(PROGRESS_FILE, phase + "\\t" + completed_value + "\\t" + str(TOTAL_VARIANTS) + "\\t" + detail_value)\n\n\ndef row_status(observed, variant):\n    if observed is None or observed == "--":\n        return "missing"\n    kind = variant.kind\n    ref = variant.reference\n    alt = variant.alternate\n    if kind == "deletion":\n        if "D" in observed:\n            return "matched"\n        return "normal"\n    if alt is not None and alt in observed:\n        return "matched"\n    if ref is not None and len(observed) == 2 and observed[0] == ref and observed[1] == ref:\n        return "normal"\n    return "normal"\n\n\ndef assay_outcome(rows):\n    if len(rows) == 0:\n        return "missing"\n    statuses = []\n    for row in rows:\n        statuses.append(row["row_status"])\n    all_missing = True\n    has_missing = False\n    has_matched = False\n    for status in statuses:\n        if status != "missing":\n            all_missing = False\n        if status == "missing":\n            has_missing = True\n        if status == "matched":\n            has_matched = True\n    if all_missing:\n        return "missing"\n    if has_missing:\n        return "partial"\n    if has_matched:\n        return "matched"\n    return "normal"\n\n\ndef main():\n    write_progress("loading_genotypes", 0, "Loading genotypes from input file")\n    genotypes = bioscript.load_genotypes(input_file)\n    write_progress("running_variants", 0, "Genotypes loaded; starting variant checks")\n    rows = []\n${rows}\n    outcome = assay_outcome(rows)\n    for row in rows:\n        row[${bioscriptLiteral(ASSAY_OUTCOME_FIELD)}] = outcome\n    write_progress("writing_output", TOTAL_VARIANTS, "Variant checks complete; writing output")\n    bioscript.write_tsv(output_file, rows)\n    write_progress("complete", TOTAL_VARIANTS, "Output written")\n\n\nif __name__ == "__main__":\n    main()\n`;
}


async function loadAssayPackage(request: RunAssayRequest): Promise<LoadedAssayPackage> {
  const assayContents = request.assayContents ?? request.fileContents?.[request.assayPath] ?? (await readTextSource(request.assayPath));
  const manifest = readYamlMap(assayContents, request.assayPath);
  const schema = manifest.schema;
  if (schema !== 'bioscript:assay') {
    throw new Error(`${request.assayPath} must declare schema: bioscript:assay`);
  }

  const implementation = (manifest.implementation as Record<string, unknown> | undefined) ?? {};
  const implementationKind = implementation.kind;
  if (implementationKind !== 'panel' && implementationKind !== 'script') {
    throw new Error(`${request.assayPath} implementation.kind must be 'panel' or 'script'`);
  }

  const outputFile = getYamlString(request.outputFileOverride ?? (manifest.outputs as Record<string, unknown> | undefined)?.file ?? request.outputFile ?? 'assay-output.tsv', 'assay output file is required');
  const assayDir = dirname(request.assayPath);
  const bundledFiles: Record<string, string> = { ...(request.fileContents ?? {}) };
  bundledFiles[request.assayPath] = assayContents;
  const compiledPath = request.compiledPath ?? joinPath(assayDir, 'assay.compiled.yaml');
  const compiledContents =
    request.compiledContents ?? bundledFiles[compiledPath] ?? (await readTextSource(compiledPath));
  bundledFiles[compiledPath] = compiledContents;
  const compiled = readYamlMap(compiledContents, compiledPath);

  const variants: VariantDefinition[] = [];
  const unsupportedVariants: LoadedAssayPackage['unsupportedVariants'] = [];

  if (implementationKind === 'panel') {
    if (compiled.schema !== 'bioscript:assay-compiled') {
      throw new Error(`${compiledPath} must declare schema: bioscript:assay-compiled for panel assays`);
    }
    console.log('[expo-bioscript] assay panel load mode', {
      assayPath: request.assayPath,
      compiledPath,
      mode: 'compiled',
    });
    const runnableEntries = Array.isArray(compiled.runnable_variants) ? compiled.runnable_variants : [];
    const unsupportedEntries = Array.isArray(compiled.unsupported_variants) ? compiled.unsupported_variants : [];

    for (const [index, rawVariant] of runnableEntries.entries()) {
      if (!rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) {
        throw new Error(`${compiledPath} runnable_variants[${index}] must be a mapping`);
      }
      variants.push(compiledVariantToDefinition(`${compiledPath}#runnable_variants[${index}]`, rawVariant as Record<string, unknown>));
    }

    for (const [index, rawVariant] of unsupportedEntries.entries()) {
      if (!rawVariant || typeof rawVariant !== 'object' || Array.isArray(rawVariant)) {
        throw new Error(`${compiledPath} unsupported_variants[${index}] must be a mapping`);
      }
      const variant = compiledVariantToDefinition(`${compiledPath}#unsupported_variants[${index}]`, rawVariant as Record<string, unknown>);
      unsupportedVariants.push({
        variantName: variant.name,
        target: formatVariantTarget(variant),
        reason: typeof (rawVariant as Record<string, unknown>).reason === 'string' ? String((rawVariant as Record<string, unknown>).reason) : 'unsupported variant',
      });
    }
  }

  if (implementationKind === 'script') {
    const scriptRef = getYamlString(implementation.path, `${request.assayPath} missing implementation.path for script assay`);
    const scriptPath = joinPath(assayDir, scriptRef);
    const scriptContents = bundledFiles[scriptPath] ?? (await readTextSource(scriptPath));
    bundledFiles[scriptPath] = scriptContents;
    return {
      implementationKind: 'script',
      outputFile,
      scriptPath,
      scriptContents,
      bundledFiles,
      unsupportedVariants,
    };
  }

  const scriptPath = joinPath(assayDir, '.generated/probe.py');
  const scriptContents = buildProbeScript(variants, request.progressFile);
  bundledFiles[scriptPath] = scriptContents;
  return {
    implementationKind: 'panel',
    outputFile,
    scriptPath,
    scriptContents,
    bundledFiles,
    unsupportedVariants,
  };
}

export async function runAssay(request: RunAssayRequest): Promise<RunFileResult> {
  const loaded = await loadAssayPackage(request);
  const fileContents: Record<string, string> = {
    ...loaded.bundledFiles,
    ...(request.fileContents ?? {}),
  };

  const runRequest: RunFileRequest = {
    scriptPath: loaded.scriptPath,
    scriptContents: loaded.scriptContents,
    root: request.root,
    inputFile: request.inputFile,
    inputContents: request.inputContents,
    outputFile: loaded.outputFile,
    fileContents,
    participantId: request.participantId,
    traceReportPath: request.traceReportPath,
    timingReportPath: request.timingReportPath,
    inputFormat: request.inputFormat,
    inputIndex: request.inputIndex,
    referenceFile: request.referenceFile,
    referenceIndex: request.referenceIndex,
    autoIndex: request.autoIndex,
    cacheDir: request.cacheDir,
    maxDurationMs: request.maxDurationMs,
    maxMemoryBytes: request.maxMemoryBytes,
    maxAllocations: request.maxAllocations,
    maxRecursionDepth: request.maxRecursionDepth,
  };

  console.log('[expo-bioscript] runFile request', {
    scriptPath: runRequest.scriptPath,
    inputFile: runRequest.inputFile,
    outputFile: runRequest.outputFile,
    maxDurationMs: runRequest.maxDurationMs,
    fileCount: Object.keys(fileContents).length,
  });

  const runStartedAt = Date.now();
  try {
    const result = await ExpoBioscriptModule.runFile(runRequest);
    console.log('[expo-bioscript] runFile complete', {
      elapsedMs: Date.now() - runStartedAt,
      outputFile: runRequest.outputFile,
      scriptPath: runRequest.scriptPath,
    });
    return {
      ...result,
      assay: {
        implementationKind: loaded.implementationKind,
        unsupportedVariants: loaded.unsupportedVariants,
      },
    };
  } catch (error) {
    console.log('[expo-bioscript] runFile failed', {
      elapsedMs: Date.now() - runStartedAt,
      message: error instanceof Error ? error.message : String(error),
      scriptPath: runRequest.scriptPath,
    });
    throw error;
  }
}
