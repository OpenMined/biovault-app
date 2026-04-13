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

function yamlVariantToDefinition(path: string, data: Record<string, unknown>): VariantDefinition {
  const schema = data.schema;
  if (schema !== 'bioscript:variant' && schema !== 'bioscript:variant:1.0') {
    throw new Error(`${path} is not a bioscript:variant record`);
  }

  const identifiers = (data.identifiers as Record<string, unknown> | undefined) ?? {};
  const coordinates = (data.coordinates as Record<string, unknown> | undefined) ?? {};
  const alleles = (data.alleles as Record<string, unknown> | undefined) ?? {};
  const rsids = Array.isArray(identifiers.rsids) ? identifiers.rsids.filter((item): item is string => typeof item === 'string') : [];
  const canonicalAlt = typeof alleles.canonical_alt === 'string' ? alleles.canonical_alt : undefined;
  const alts = Array.isArray(alleles.alts) ? alleles.alts.filter((item): item is string => typeof item === 'string') : [];
  const ref = typeof alleles.ref === 'string' ? alleles.ref : undefined;
  const deletionLength = typeof alleles.deletion_length === 'number' ? alleles.deletion_length : undefined;
  const motifs = Array.isArray(alleles.motifs) ? alleles.motifs.filter((item): item is string => typeof item === 'string') : undefined;
  const rawKind = typeof alleles.kind === 'string' ? alleles.kind : 'snv';
  const kindMap: Record<string, string> = { snv: 'snp', deletion: 'deletion', insertion: 'insertion', indel: 'indel' };
  const kind = kindMap[rawKind] ?? rawKind;
  const grch37 = formatCoord(coordinates.grch37 as Record<string, unknown> | undefined);
  const grch38 = formatCoord(coordinates.grch38 as Record<string, unknown> | undefined);
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const firstFinding = findings.find((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown> | undefined;
  const note = typeof firstFinding?.notes === 'string' ? firstFinding.notes : undefined;
  const gene = typeof data.gene === 'string' ? data.gene : undefined;
  const location = grch37 ? `GRCh37 chr${grch37.split(':')[0]}:${grch37.split(':')[1]?.replace(/-.+$/, '') ?? ''}` : grch38 ? `GRCh38 chr${grch38.split(':')[0]}:${grch38.split(':')[1]?.replace(/-.+$/, '') ?? ''}` : undefined;

  if (!rsids.length && !grch37 && !grch38) {
    throw new Error(`${path} must declare at least one rsid or genomic coordinate`);
  }
  if ((kind === 'snp' || kind === 'deletion') && !ref) {
    throw new Error(`${path} ${kind} variant missing ref allele`);
  }
  const alt = canonicalAlt && alts.includes(canonicalAlt) ? canonicalAlt : alts[0];
  if ((kind === 'snp' || kind === 'deletion') && !alt) {
    throw new Error(`${path} ${kind} variant missing alt allele`);
  }
  if (kind === 'deletion' && !deletionLength) {
    throw new Error(`${path} deletion variant missing deletion_length`);
  }

  const variantNameSource = typeof data.name === 'string' && data.name ? data.name : path.split('/').pop() ?? 'variant';
  const name = variantNameSource.replace(/[^A-Za-z0-9_]/g, '_');
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
      motifs,
    },
  };
}

function runtimeSupportsVariant(variant: VariantDefinition): { supported: boolean; reason?: string } {
  const kind = String(variant.fields.kind ?? '').toLowerCase();
  if (!kind || kind === 'snp') {
    return { supported: true };
  }
  if (kind === 'deletion') {
    return variant.fields.deletion_length ? { supported: true } : { supported: false, reason: 'deletions require deletion_length' };
  }
  if (kind === 'insertion') {
    return { supported: false, reason: 'insertions not yet supported by bioscript runtime' };
  }
  if (kind === 'indel') {
    return { supported: false, reason: 'indels not yet supported by bioscript runtime' };
  }
  return { supported: false, reason: `unsupported variant kind: ${kind}` };
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

function buildProbeScript(variants: VariantDefinition[]): string {
  const blocks = variants
    .map((variant) => {
      const args = Object.entries(variant.fields)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `    ${key === 'deletion_length' ? 'deletion_length' : key}=${bioscriptLiteral(value)}`)
        .join(',\n');
      return `${variant.name} = bioscript.variant(\n${args}\n)\n`;
    })
    .join('\n');

  const rows = variants
    .map(
      (variant) => `    observed_${variant.name} = genotypes.lookup_variant(${variant.name})\n    row_status_${variant.name} = row_status(observed_${variant.name}, ${variant.name})\n    rows.append({\n        "participant_id": participant_id,\n        "gene": ${bioscriptLiteral(variant.gene ?? 'Unknown')},\n        "label": ${bioscriptLiteral(variant.label)},\n        "rsid": ${bioscriptLiteral(variant.fields.rsid ?? null)},\n        "location": ${bioscriptLiteral(variant.location ?? null)},\n        "kind": ${bioscriptLiteral(String(variant.fields.kind ?? 'snp').toUpperCase())},\n        "ref": ${bioscriptLiteral(variant.fields.ref ?? null)},\n        "alts": ${bioscriptLiteral(variant.alts ?? [])},\n        "observed": observed_${variant.name},\n        "row_status": row_status_${variant.name},\n        "summary": ${bioscriptLiteral(variant.note ?? '')},\n    })`,
    )
    .join('\n');

  return `${blocks}\n\ndef row_status(observed, variant):\n    if observed is None or observed == "--":\n        return "missing"\n    kind = variant.kind\n    ref = variant.reference\n    alt = variant.alternate\n    if kind == "deletion":\n        if "D" in observed:\n            return "matched"\n        return "normal"\n    if alt is not None and alt in observed:\n        return "matched"\n    if ref is not None and len(observed) == 2 and observed[0] == ref and observed[1] == ref:\n        return "normal"\n    return "normal"\n\n\ndef assay_outcome(rows):\n    if len(rows) == 0:\n        return "missing"\n    statuses = []\n    for row in rows:\n        statuses.append(row["row_status"])\n    all_missing = True\n    has_missing = False\n    has_matched = False\n    for status in statuses:\n        if status != "missing":\n            all_missing = False\n        if status == "missing":\n            has_missing = True\n        if status == "matched":\n            has_matched = True\n    if all_missing:\n        return "missing"\n    if has_missing:\n        return "partial"\n    if has_matched:\n        return "matched"\n    return "normal"\n\n\ndef main():\n    genotypes = bioscript.load_genotypes(input_file)\n    rows = []\n${rows}\n    outcome = assay_outcome(rows)\n    for row in rows:\n        row[${bioscriptLiteral(ASSAY_OUTCOME_FIELD)}] = outcome\n    bioscript.write_tsv(output_file, rows)\n\n\nif __name__ == "__main__":\n    main()\n`;
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

  const inputs = (manifest.inputs as Record<string, unknown> | undefined) ?? {};
  const catalogueRef = inputs.catalogue;
  if (typeof catalogueRef !== 'string' || !catalogueRef) {
    throw new Error(`${request.assayPath} missing inputs.catalogue`);
  }
  const cataloguePath = joinPath(assayDir, catalogueRef);
  const catalogueContents = bundledFiles[cataloguePath] ?? (await readTextSource(cataloguePath));
  bundledFiles[cataloguePath] = catalogueContents;
  const catalogue = readYamlMap(catalogueContents, cataloguePath);
  if (catalogue.schema !== 'bioscript:catalogue') {
    throw new Error(`${cataloguePath} must declare schema: bioscript:catalogue`);
  }
  const entries = Array.isArray(catalogue.variants) ? catalogue.variants : null;
  if (!entries || entries.length === 0) {
    throw new Error(`${cataloguePath} missing variants list`);
  }

  const variants: VariantDefinition[] = [];
  const unsupportedVariants: LoadedAssayPackage['unsupportedVariants'] = [];
  for (const [index, rawEntry] of entries.entries()) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      throw new Error(`${cataloguePath} variants[${index}] must be a mapping`);
    }
    const entry = rawEntry as Record<string, unknown>;
    const variantRef = entry.path;
    if (typeof variantRef !== 'string' || !variantRef) {
      throw new Error(`${cataloguePath} variants[${index}] missing path`);
    }
    const variantPath = joinPath(dirname(cataloguePath), variantRef);
    const variantContents = bundledFiles[variantPath] ?? (await readTextSource(variantPath));
    bundledFiles[variantPath] = variantContents;
    const variant = yamlVariantToDefinition(variantPath, readYamlMap(variantContents, variantPath));
    const support = runtimeSupportsVariant(variant);
    if (support.supported) {
      variants.push(variant);
    } else {
      unsupportedVariants.push({
        variantName: variant.name,
        target: formatVariantTarget(variant),
        reason: support.reason ?? 'unsupported variant',
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
  const scriptContents = buildProbeScript(variants);
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

  const result = await ExpoBioscriptModule.runFile(runRequest);
  return {
    ...result,
    assay: {
      implementationKind: loaded.implementationKind,
      unsupportedVariants: loaded.unsupportedVariants,
    },
  };
}
