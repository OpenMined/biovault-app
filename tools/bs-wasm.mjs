#!/usr/bin/env node
// CLI shim that mirrors `bioscript/bs report ...` but routes through the
// wasm artifact instead of the rust CLI. Used by exvitae's test_reports.py
// (passed via --bioscript) to verify the wasm path produces the same 4
// artifacts (observations.tsv / analysis.jsonl / reports.jsonl / index.html)
// against the same sample.yaml fixtures the CLI does — without going through
// the browser.
//
// Usage:
//   node tools/bs-wasm.mjs report <manifest.yaml> \
//        --root <root>                            \
//        --input-file <path>                      \
//        [--input-index <path>]                   \
//        [--input-format vcf]                     \
//        [--reference-file <path>]                \
//        [--reference-index <path>]               \
//        [--output-dir <dir>]                     \
//        [--detect-sex] [--html]                  \
//        [--analysis-max-duration-ms <ms>]        \
//        [--sample-sex <male|female|unknown>]     \
//        [--allow-md5-mismatch]                   \
//        [--open]
//
// `--open` is accepted for parity with the CLI and ignored.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WASM_PKG_DIR = path.resolve(
  __dirname,
  '..',
  'bioscript',
  'rust',
  'bioscript-wasm',
  'pkg-node',
)

const argv = process.argv.slice(2)
if (argv[0] !== 'report') {
  console.error(`bs-wasm: only the \`report\` subcommand is supported (got: ${argv[0]})`)
  process.exit(2)
}

function parseArgs(args) {
  const out = { manifest: null, root: null, inputFile: null, outputDir: null }
  let i = 1 // skip "report"
  while (i < args.length) {
    const tok = args[i]
    if (!tok.startsWith('--')) {
      if (!out.manifest) {
        out.manifest = tok
      } else {
        console.error(`bs-wasm: unexpected positional arg ${tok}`)
        process.exit(2)
      }
      i += 1
      continue
    }
    const flag = tok.replace(/^--/, '').replace(/-/g, '_')
    if (
      flag === 'detect_sex' ||
      flag === 'html' ||
      flag === 'open' ||
      flag === 'allow_md5_mismatch'
    ) {
      out[flag] = true
      i += 1
      continue
    }
    const val = args[i + 1]
    if (val === undefined || val.startsWith('--')) {
      out[flag] = true
      i += 1
    } else {
      out[flag] = val
      i += 2
    }
  }
  return out
}

const opts = parseArgs(argv)
if (!opts.manifest || !opts.input_file) {
  console.error('bs-wasm: missing required <manifest> or --input-file')
  process.exit(2)
}

const manifestAbs = path.resolve(opts.manifest)
const inputFileAbs = path.resolve(opts.input_file)
const outputDirAbs = path.resolve(opts.output_dir || 'test-output/wasm-report')
fs.mkdirSync(outputDirAbs, { recursive: true })

const inputName = path.basename(inputFileAbs)
const inputFormat = (opts.input_format || '').toLowerCase()
const isCram = inputFormat === 'cram' || inputFileAbs.toLowerCase().endsWith('.cram')
const isVcf =
  inputFormat === 'vcf' ||
  inputFileAbs.toLowerCase().endsWith('.vcf.gz') ||
  inputFileAbs.toLowerCase().endsWith('.bcf')

// Walk the manifest's directory once, collecting every YAML / Python / TSV /
// CSV file so the wasm `PackageWorkspace` can resolve relative paths the
// same way it does inside a zip-loaded package. Keys are paths relative to
// the manifest's containing dir (matching how the wasm resolves
// `member.path` against `manifest_path`).
function collectPackageFiles(manifestPath) {
  const root = path.dirname(manifestPath)
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      const lower = entry.name.toLowerCase()
      if (
        !lower.endsWith('.yaml') &&
        !lower.endsWith('.yml') &&
        !lower.endsWith('.py') &&
        !lower.endsWith('.tsv') &&
        !lower.endsWith('.csv') &&
        !lower.endsWith('.json') &&
        !lower.endsWith('.md')
      ) {
        continue
      }
      const relative = path.relative(root, full)
      files.push({
        path: relative,
        contents: fs.readFileSync(full, 'utf8'),
        sourceUrl: null,
      })
    }
  }
  walk(root)
  return { files, manifestRel: path.relative(root, manifestPath) }
}

const { files: packageFiles, manifestRel } = collectPackageFiles(manifestAbs)

const reportOptions = {
  analysisMaxDurationMs: Number(opts.analysis_max_duration_ms ?? 30000),
  detectSex: Boolean(opts.detect_sex),
  filters: [],
  sampleSex: opts.sample_sex || null,
}

// Build a readAt(offset, length) -> Uint8Array callback over a file
// descriptor — mirrors the FileReaderSync callback the browser worker uses.
function makeFsReadAt(filePath) {
  const fd = fs.openSync(filePath, 'r')
  const stat = fs.fstatSync(fd)
  const len = stat.size
  const readAt = (offset, length) => {
    if (length === 0) return new Uint8Array(0)
    const end = Math.min(len, offset + length)
    const want = end - offset
    if (want <= 0) return new Uint8Array(0)
    const buf = Buffer.allocUnsafe(want)
    fs.readSync(fd, buf, 0, want, offset)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  return { readAt, len, close: () => fs.closeSync(fd) }
}

async function loadWasm() {
  // The nodejs-target build produces a CommonJS module; load via require so
  // the wasm is instantiated synchronously at import time.
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const pkgJsonPath = path.join(WASM_PKG_DIR, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(
      `bs-wasm: pkg-node not built. Run: cd bioscript/rust/bioscript-wasm && RUSTFLAGS='--cfg getrandom_backend="wasm_js"' wasm-pack build --target nodejs --dev --out-dir pkg-node`,
    )
    process.exit(2)
  }
  const main = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).main || 'bioscript_wasm.js'
  return require(path.join(WASM_PKG_DIR, main))
}

function writeArtifacts(artifacts) {
  for (const a of artifacts) {
    const target = path.join(outputDirAbs, a.path || a.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, a.text, 'utf8')
  }
}

const wasm = await loadWasm()

let resultJson
if (isCram) {
  if (!opts.reference_file || !opts.reference_index || !opts.input_index) {
    console.error(
      'bs-wasm: CRAM input requires --input-index, --reference-file, --reference-index',
    )
    process.exit(2)
  }
  const cram = makeFsReadAt(inputFileAbs)
  const fasta = makeFsReadAt(path.resolve(opts.reference_file))
  const craiBytes = new Uint8Array(fs.readFileSync(path.resolve(opts.input_index)))
  const faiBytes = new Uint8Array(fs.readFileSync(path.resolve(opts.reference_index)))
  try {
    resultJson = wasm.runPackageReportFromCram(
      manifestRel,
      JSON.stringify(packageFiles),
      inputName,
      cram.readAt,
      cram.len,
      craiBytes,
      fasta.readAt,
      fasta.len,
      faiBytes,
      JSON.stringify(reportOptions),
    )
  } finally {
    cram.close()
    fasta.close()
  }
} else if (isVcf) {
  if (!opts.input_index) {
    console.error('bs-wasm: VCF input requires --input-index (tabix .tbi)')
    process.exit(2)
  }
  const vcf = makeFsReadAt(inputFileAbs)
  const tbiBytes = new Uint8Array(fs.readFileSync(path.resolve(opts.input_index)))
  try {
    resultJson = wasm.runPackageReportFromVcf(
      manifestRel,
      JSON.stringify(packageFiles),
      inputName,
      vcf.readAt,
      vcf.len,
      tbiBytes,
      JSON.stringify(reportOptions),
    )
  } finally {
    vcf.close()
  }
} else {
  // text / zip — load whole bytes (text genome files are typically a few MB).
  const inputBytes = new Uint8Array(fs.readFileSync(inputFileAbs))
  resultJson = wasm.runPackageReportBytes(
    manifestRel,
    JSON.stringify(packageFiles),
    inputName,
    inputBytes,
    JSON.stringify(reportOptions),
  )
}

const result = JSON.parse(resultJson)
writeArtifacts(result.artifacts)
console.log(result.textOutput || '')
