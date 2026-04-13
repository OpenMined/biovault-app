import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const assaysRoot = path.join(repoRoot, 'assets', 'assays');
const outputPath = path.join(repoRoot, 'lib', 'generated-assay-manifests.ts');

const CATEGORY_MAP = {
  ancestry: 'ancestry',
  pgx: 'pgx',
  risk: 'risk',
  traits: 'traits',
};

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, 'utf8'));
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatLocation(coordinates) {
  if (!coordinates || typeof coordinates !== 'object') {
    return null;
  }

  for (const assembly of ['grch37', 'grch38']) {
    const entry = coordinates[assembly];
    if (!entry || typeof entry !== 'object' || typeof entry.chrom !== 'string') {
      continue;
    }
    const assemblyLabel = assembly.toUpperCase();
    if (typeof entry.pos === 'number') {
      return `${assemblyLabel} chr${entry.chrom}:${entry.pos}`;
    }
    if (typeof entry.start === 'number' && typeof entry.end === 'number') {
      return `${assemblyLabel} chr${entry.chrom}:${entry.start}-${entry.end}`;
    }
  }

  return null;
}

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const nextPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(nextPath));
      continue;
    }
    files.push(nextPath);
  }
  return files.sort();
}

function renderValue(value, indent = 0) {
  const space = '  '.repeat(indent);
  const nextSpace = '  '.repeat(indent + 1);

  if (value && typeof value === 'object' && value.__raw) {
    return value.__raw;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return '[]';
    }
    return `[\n${value.map((item) => `${nextSpace}${renderValue(item, indent + 1)}`).join(',\n')}\n${space}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) {
      return '{}';
    }
    return `{\n${entries
      .map(([key, item]) => {
        const renderedKey = /^[$A-Z_][0-9A-Z_$]*$/i.test(key) ? key : JSON.stringify(key);
        return `${nextSpace}${renderedKey}: ${renderValue(item, indent + 1)}`;
      })
      .join(',\n')}\n${space}}`;
  }

  return JSON.stringify(value);
}

function readInterpretationStates(assay) {
  const states = assay.interpretation?.states ?? {};
  return {
    matched: {
      headline: states.matched?.headline ?? 'Signal detected',
      body: states.matched?.body ?? 'This assay detected one or more matching rows.',
      caveat: states.matched?.caveat ?? null,
    },
    normal: {
      headline: states.normal?.headline ?? 'No flagged signal found',
      body: states.normal?.body ?? 'The checked rows were present, but no flagged signal was detected.',
      caveat: states.normal?.caveat ?? null,
    },
    missing: {
      headline: states.missing?.headline ?? 'Not enough data',
      body: states.missing?.body ?? 'This file did not include enough expected data for a confident result.',
      caveat: states.missing?.caveat ?? null,
    },
    partial: {
      headline: states.partial?.headline ?? 'Partial result',
      body: states.partial?.body ?? 'Some expected rows were present, but coverage was incomplete.',
      caveat: states.partial?.caveat ?? null,
    },
  };
}

function buildAssayMembers(packageDir, cataloguePath) {
  const catalogue = readYaml(cataloguePath);
  const groups = new Map();

  for (const variantRef of catalogue.variants ?? []) {
    const variantPath = path.join(packageDir, String(variantRef.path));
    const variant = readYaml(variantPath);
    const gene = typeof variant.gene === 'string' && variant.gene.trim() ? variant.gene.trim() : 'Unassigned';
    const items = groups.get(gene) ?? [];
    const rsids = Array.isArray(variant.identifiers?.rsids)
      ? variant.identifiers.rsids.filter((entry) => typeof entry === 'string')
      : [];
    const alts = Array.isArray(variant.alleles?.alts)
      ? variant.alleles.alts.filter((entry) => typeof entry === 'string')
      : [];
    const findings = Array.isArray(variant.findings) ? variant.findings : [];
    const firstFinding = findings.find((entry) => entry && typeof entry === 'object');

    items.push({
      id: String(variantRef.id ?? variant.name ?? path.basename(variantPath, '.yaml')),
      rsid: rsids[0] ?? null,
      location: formatLocation(variant.coordinates),
      kind:
        variant.alleles?.kind === 'deletion' ||
        variant.alleles?.kind === 'insertion' ||
        variant.alleles?.kind === 'indel'
          ? 'INDEL'
          : 'SNV',
      ref: typeof variant.alleles?.ref === 'string' ? variant.alleles.ref : null,
      alts,
      note:
        typeof firstFinding?.notes === 'string'
          ? firstFinding.notes
          : typeof variant.summary === 'string'
            ? variant.summary
            : '',
    });

    groups.set(gene, items);
  }

  return Array.from(groups.entries()).map(([gene, items]) => ({ gene, items }));
}

function buildManifest(packageDir) {
  const assayPath = path.join(packageDir, 'assay.yaml');
  const assay = readYaml(assayPath);
  const packageRelativeDir = toPosix(path.relative(repoRoot, packageDir));
  const packageFiles = listFiles(packageDir).map((filePath) => toPosix(path.relative(repoRoot, filePath)));
  const catalogueRelativePath = toPosix(path.join(packageRelativeDir, String(assay.inputs?.catalogue ?? 'catalogue.yaml')));
  const cataloguePath = path.join(repoRoot, catalogueRelativePath);

  return {
    id: toSlug(assay.assay_id),
    title: String(assay.label ?? ''),
    subtitle: String(assay.summary ?? ''),
    summary: String(assay.summary ?? ''),
    description: String(assay.summary ?? ''),
    disclaimer: typeof assay.metadata?.disclaimer === 'string' ? assay.metadata.disclaimer : null,
    category: CATEGORY_MAP[String(assay.metadata?.category ?? '')] ?? 'traits',
    tags: Array.isArray(assay.metadata?.tags) ? assay.metadata.tags.filter((entry) => typeof entry === 'string') : [],
    packageVersion: String(assay.package?.assay_version ?? assay.version ?? '1.0'),
    sourceOfTruth: String(assay.package?.source_of_truth ?? 'package'),
    ui: {
      template: String(assay.ui?.template ?? 'variant-panel'),
      version: String(assay.ui?.version ?? '1.0'),
    },
    compatibility: {
      worksWith: Array.isArray(assay.compatibility?.works_with)
        ? assay.compatibility.works_with.filter((entry) => typeof entry === 'string')
        : [],
      assemblies: Array.isArray(assay.compatibility?.assemblies)
        ? assay.compatibility.assemblies.filter((entry) => typeof entry === 'string')
        : [],
      notes: Array.isArray(assay.compatibility?.notes)
        ? assay.compatibility.notes.filter((entry) => typeof entry === 'string')
        : typeof assay.compatibility?.notes === 'string'
          ? [assay.compatibility.notes]
          : [],
    },
    privacy: {
      mode: String(assay.privacy?.mode ?? 'unknown'),
      uploadsData: Boolean(assay.privacy?.uploads_data),
      storesResultsLocally: Boolean(assay.privacy?.stores_results_locally),
      externalUrls: Array.isArray(assay.privacy?.external_urls)
        ? assay.privacy.external_urls.filter((entry) => typeof entry === 'string')
        : [],
    },
    interpretation: readInterpretationStates(assay),
    files: packageFiles,
    bundledAssay: {
      assayAssetModuleId: { __raw: `require('../${packageRelativeDir}/assay.yaml')` },
      assayPath: `${packageRelativeDir}/assay.yaml`,
      fileAssetModuleIds: Object.fromEntries(
        packageFiles.map((filePath) => [filePath, { __raw: `require('../${filePath}')` }])
      ),
    },
    assayMembers: buildAssayMembers(packageDir, cataloguePath),
  };
}

const packageDirectories = fs
  .readdirSync(assaysRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(assaysRoot, entry.name, 'assay.yaml')))
  .map((entry) => path.join(assaysRoot, entry.name))
  .sort();

const manifests = packageDirectories.map(buildManifest);

const output = `/* eslint-disable */
// Generated by scripts/generate-assay-manifests.mjs. Do not edit by hand.
import type { AssayManifest } from '@/lib/assay-manifests'

export const generatedAssayManifests: AssayManifest[] = ${renderValue(manifests)}
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
