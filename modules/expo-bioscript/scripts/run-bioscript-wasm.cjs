#!/usr/bin/env node
// Diagnostic CLI: drives the bioscript-wasm module (nodejs target) against
// local files without Metro or a browser. Two modes:
//
//   inspect <file> [optionsJson]
//       → calls inspectBytes with the whole file in memory.
//
//   genotype --input <genotype.txt|genotype.zip> --variants '<json>'
//       → calls lookupGenotypeBytesVariants with the whole file in memory.
//
//   rsids --input <genotype.txt|genotype.zip> --rsids '<json>'
//       → calls lookupGenotypeBytesRsids with the whole file in memory.
//
//   cram --cram <x.cram> --crai <x.cram.crai> \
//        --fasta <ref.fa> --fai <ref.fa.fai> \
//        --variants '<json>' [--assembly grch38]
//       → opens the CRAM + FASTA as file descriptors and supplies
//         synchronous readAt callbacks into the wasm module, so 20 GB+
//         inputs never load into memory. The .crai / .fai payloads are
//         small and passed inline. See wasm.md for the larger migration
//         context.
//
//   vcf --vcf <x.vcf.gz> --tbi <x.vcf.gz.tbi> --variants '<json>'
//       → tabix-indexed SNP lookup over a bgzipped VCF. Same readAt shape
//         as cram, but with just one reader + tbi index inline.
//
//   report-bam --package-dir <dir> --bam <x.bam> --bai <x.bam.bai>
//       → runs a package report through runPackageReportFromBam, matching the
//         browser worker's package-report wasm entrypoint.
//
//   report-cram --package-dir <dir> --cram <x.cram> --crai <x.cram.crai> \
//        --fasta <ref.fa> --fai <ref.fa.fai>
//       → runs the same package-report path for CRAM + CRAI + FASTA + FAI.
//
// wasm-pack is invoked with --target nodejs into pkg-node/ on every run;
// cargo handles the incremental caching so this is near-free when nothing
// changed. Pass RUN_BIOSCRIPT_WASM_NO_BUILD=1 to skip the rebuild.
//
// Use the dev wasm profile by default to mirror the app web build and avoid
// the workspace's size/LTO release profile, which traps in the CRAM block
// decoder for large indexed CRAMs.

'use strict';

const { openSync, readFileSync, readSync, existsSync, fstatSync, closeSync } = require('node:fs');
const { basename, relative, resolve, join } = require('node:path');
const { execFileSync } = require('node:child_process');

const CRATE_DIR = resolve(__dirname, '..', '..', '..', 'bioscript', 'rust', 'bioscript-wasm');
const PKG_DIR = join(CRATE_DIR, 'pkg-node');
const PKG_JS = join(PKG_DIR, 'bioscript_wasm.js');

function buildIfNeeded() {
  if (process.env.RUN_BIOSCRIPT_WASM_NO_BUILD === '1' && existsSync(PKG_JS)) {
    return;
  }
  try {
    execFileSync('wasm-pack', ['build', '--target', 'nodejs', '--dev', '--out-dir', 'pkg-node'], {
      cwd: CRATE_DIR,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[run-bioscript-wasm] wasm-pack build failed');
    console.error('[run-bioscript-wasm] install with: cargo install wasm-pack');
    process.exit(2);
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !key.startsWith('--') || value === undefined) {
      throw new Error(`unexpected argument: ${argv.slice(i).join(' ')}`);
    }
    flags[key.slice(2)] = value;
  }
  return flags;
}

function requireFlag(flags, name) {
  if (!flags[name]) {
    throw new Error(`missing --${name}`);
  }
  return flags[name];
}

function makeReadAt(fd, path) {
  // Reused across calls to avoid per-call allocation; resized if the wasm
  // side asks for more than we've ever served before.
  let scratch = Buffer.allocUnsafe(1 << 20); // 1 MiB initial
  return (offset, length) => {
    if (length > scratch.length) {
      scratch = Buffer.allocUnsafe(length);
    }
    const bytesRead = readSync(fd, scratch, 0, length, offset);
    if (bytesRead === 0) {
      return new Uint8Array(0);
    }
    // wasm-bindgen copies the buffer contents immediately, so reusing
    // `scratch` on the next call is safe. Slicing creates a fresh view so
    // downstream Uint8Array construction sees exactly `bytesRead` bytes.
    return new Uint8Array(scratch.buffer, scratch.byteOffset, bytesRead).slice();
  };
}

function runInspect(mod, args) {
  const [filePath, optionsJson] = args;
  const absPath = resolve(filePath);
  const bytes = readFileSync(absPath);
  const name = basename(absPath);
  console.error(`[run-bioscript-wasm] inspecting ${name} (${bytes.length} bytes)`);
  try {
    const resultJson = mod.inspectBytes(name, bytes, optionsJson || undefined);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] inspectBytes threw:');
    console.error(err);
    process.exitCode = 3;
  }
}

function runGenotype(mod, args) {
  const flags = parseFlags(args);
  const inputPath = resolve(requireFlag(flags, 'input'));
  const variantsJson = requireFlag(flags, 'variants');
  const bytes = readFileSync(inputPath);
  const name = basename(inputPath);
  console.error(`[run-bioscript-wasm] genotype=${name} (${bytes.length} bytes)`);
  try {
    const startedAt = Date.now();
    const resultJson = mod.lookupGenotypeBytesVariants(name, bytes, variantsJson);
    console.error(`[run-bioscript-wasm] lookupGenotypeBytesVariants took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] lookupGenotypeBytesVariants threw:');
    console.error(err);
    process.exitCode = 3;
  }
}

function runRsids(mod, args) {
  const flags = parseFlags(args);
  const inputPath = resolve(requireFlag(flags, 'input'));
  const rsidsJson = requireFlag(flags, 'rsids');
  const bytes = readFileSync(inputPath);
  const name = basename(inputPath);
  console.error(`[run-bioscript-wasm] rsids genotype=${name} (${bytes.length} bytes)`);
  try {
    const startedAt = Date.now();
    const resultJson = mod.lookupGenotypeBytesRsids(name, bytes, rsidsJson);
    console.error(`[run-bioscript-wasm] lookupGenotypeBytesRsids took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] lookupGenotypeBytesRsids threw:');
    console.error(err);
    process.exitCode = 3;
  }
}

function runCram(mod, args) {
  const flags = parseFlags(args);
  const cramPath = resolve(requireFlag(flags, 'cram'));
  const craiPath = resolve(requireFlag(flags, 'crai'));
  const fastaPath = resolve(requireFlag(flags, 'fasta'));
  const faiPath = resolve(requireFlag(flags, 'fai'));
  const variantsJson = requireFlag(flags, 'variants');

  const craiBytes = readFileSync(craiPath);
  const faiBytes = readFileSync(faiPath);

  const cramFd = openSync(cramPath, 'r');
  const fastaFd = openSync(fastaPath, 'r');
  try {
    const cramLen = fstatSync(cramFd).size;
    const fastaLen = fstatSync(fastaFd).size;
    console.error(
      `[run-bioscript-wasm] cram=${cramPath} (${cramLen} bytes), ` +
        `fasta=${fastaPath} (${fastaLen} bytes), ` +
        `crai=${craiBytes.length} bytes, fai=${faiBytes.length} bytes`,
    );

    const cramReadAt = makeReadAt(cramFd, cramPath);
    const fastaReadAt = makeReadAt(fastaFd, fastaPath);

    const startedAt = Date.now();
    const resultJson = mod.lookupCramVariants(
      cramReadAt,
      cramLen,
      craiBytes,
      fastaReadAt,
      fastaLen,
      faiBytes,
      variantsJson,
    );
    console.error(`[run-bioscript-wasm] lookupCramVariants took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] lookupCramVariants threw:');
    console.error(err);
    process.exitCode = 3;
  } finally {
    closeSync(cramFd);
    closeSync(fastaFd);
  }
}

function runVcf(mod, args) {
  const flags = parseFlags(args);
  const vcfPath = resolve(requireFlag(flags, 'vcf'));
  const tbiPath = resolve(requireFlag(flags, 'tbi'));
  const variantsJson = requireFlag(flags, 'variants');

  const tbiBytes = readFileSync(tbiPath);

  const vcfFd = openSync(vcfPath, 'r');
  try {
    const vcfLen = fstatSync(vcfFd).size;
    console.error(
      `[run-bioscript-wasm] vcf=${vcfPath} (${vcfLen} bytes), tbi=${tbiBytes.length} bytes`,
    );

    const vcfReadAt = makeReadAt(vcfFd, vcfPath);

    const startedAt = Date.now();
    const resultJson = mod.lookupVcfVariants(vcfReadAt, vcfLen, tbiBytes, variantsJson);
    console.error(`[run-bioscript-wasm] lookupVcfVariants took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] lookupVcfVariants threw:');
    console.error(err);
    process.exitCode = 3;
  } finally {
    closeSync(vcfFd);
  }
}

function packageFilesFromDir(packageDir) {
  const absDir = resolve(packageDir);
  const paths = [
    'manifest.yaml',
    'assay.yaml',
    'muc1-vntr.yaml',
    'vntyper.py',
    'assets/muc1_motifs.fa',
  ];
  return paths.map((path) => ({
    path,
    contents: readFileSync(join(absDir, path), 'utf8'),
    sourceUrl: `file://${join(absDir, path)}`,
  }));
}

function runReportBam(mod, args) {
  const flags = parseFlags(args);
  const packageDir = resolve(requireFlag(flags, 'package-dir'));
  const bamPath = resolve(requireFlag(flags, 'bam'));
  const baiPath = resolve(requireFlag(flags, 'bai'));
  const manifestPath = flags.manifest || 'manifest.yaml';
  const optionsJson = flags.options || JSON.stringify({
    analysisMaxDurationMs: 300000,
    detectSex: true,
    filters: [],
  });
  const packageFiles = packageFilesFromDir(packageDir);
  const baiBytes = readFileSync(baiPath);
  const bamBytes = readFileSync(bamPath);
  const bamFd = openSync(bamPath, 'r');
  try {
    const bamLen = fstatSync(bamFd).size;
    const bamReadAt = makeReadAt(bamFd, bamPath);
    console.error(
      `[run-bioscript-wasm] report-bam package=${relative(process.cwd(), packageDir)} ` +
        `bam=${basename(bamPath)} (${bamLen} bytes), bai=${baiBytes.length} bytes`,
    );
    const startedAt = Date.now();
    const resultJson = mod.runPackageReportFromBam(
      manifestPath,
      JSON.stringify(packageFiles),
      basename(bamPath),
      bamReadAt,
      bamLen,
      bamBytes,
      baiBytes,
      optionsJson,
    );
    console.error(`[run-bioscript-wasm] runPackageReportFromBam took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] runPackageReportFromBam threw:');
    console.error(err);
    process.exitCode = 3;
  } finally {
    closeSync(bamFd);
  }
}

function runReportCram(mod, args) {
  const flags = parseFlags(args);
  const packageDir = resolve(requireFlag(flags, 'package-dir'));
  const cramPath = resolve(requireFlag(flags, 'cram'));
  const craiPath = resolve(requireFlag(flags, 'crai'));
  const fastaPath = resolve(requireFlag(flags, 'fasta'));
  const faiPath = resolve(requireFlag(flags, 'fai'));
  const manifestPath = flags.manifest || 'manifest.yaml';
  const optionsJson = flags.options || JSON.stringify({
    analysisMaxDurationMs: 300000,
    detectSex: true,
    filters: [],
    allowReferenceMd5Mismatch: true,
  });
  const packageFiles = packageFilesFromDir(packageDir);
  const cramBytes = readFileSync(cramPath);
  const craiBytes = readFileSync(craiPath);
  const fastaBytes = readFileSync(fastaPath);
  const faiBytes = readFileSync(faiPath);
  const cramFd = openSync(cramPath, 'r');
  const fastaFd = openSync(fastaPath, 'r');
  try {
    const cramLen = fstatSync(cramFd).size;
    const fastaLen = fstatSync(fastaFd).size;
    const cramReadAt = makeReadAt(cramFd, cramPath);
    const fastaReadAt = makeReadAt(fastaFd, fastaPath);
    console.error(
      `[run-bioscript-wasm] report-cram package=${relative(process.cwd(), packageDir)} ` +
        `cram=${basename(cramPath)} (${cramLen} bytes), crai=${craiBytes.length} bytes, ` +
        `fasta=${basename(fastaPath)} (${fastaLen} bytes), fai=${faiBytes.length} bytes`,
    );
    const startedAt = Date.now();
    const resultJson = mod.runPackageReportFromCram(
      manifestPath,
      JSON.stringify(packageFiles),
      basename(cramPath),
      cramReadAt,
      cramLen,
      cramBytes,
      craiBytes,
      fastaReadAt,
      fastaLen,
      fastaBytes,
      faiBytes,
      optionsJson,
    );
    console.error(`[run-bioscript-wasm] runPackageReportFromCram took ${Date.now() - startedAt}ms`);
    console.log(JSON.stringify(JSON.parse(resultJson), null, 2));
  } catch (err) {
    console.error('[run-bioscript-wasm] runPackageReportFromCram threw:');
    console.error(err);
    process.exitCode = 3;
  } finally {
    closeSync(cramFd);
    closeSync(fastaFd);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('usage:');
    console.error('  run-bioscript-wasm.cjs inspect <file> [optionsJson]');
    console.error("  run-bioscript-wasm.cjs genotype --input <genotype.txt|genotype.zip> --variants '<json>'");
    console.error("  run-bioscript-wasm.cjs rsids --input <genotype.txt|genotype.zip> --rsids '<json>'");
    console.error(
      '  run-bioscript-wasm.cjs cram --cram <x.cram> --crai <x.cram.crai> \\',
    );
    console.error("      --fasta <ref.fa> --fai <ref.fa.fai> --variants '<json>'");
    console.error(
      "  run-bioscript-wasm.cjs vcf --vcf <x.vcf.gz> --tbi <x.vcf.gz.tbi> --variants '<json>'",
    );
    console.error("  run-bioscript-wasm.cjs report-bam --package-dir <dir> --bam <x.bam> --bai <x.bam.bai>");
    console.error("  run-bioscript-wasm.cjs report-cram --package-dir <dir> --cram <x.cram> --crai <x.cram.crai> --fasta <ref.fa> --fai <ref.fa.fai>");
    process.exit(1);
  }

  buildIfNeeded();
  const mod = require(PKG_JS);

  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case 'inspect':
      runInspect(mod, rest);
      break;
    case 'genotype':
      runGenotype(mod, rest);
      break;
    case 'rsids':
      runRsids(mod, rest);
      break;
    case 'cram':
      runCram(mod, rest);
      break;
    case 'vcf':
      runVcf(mod, rest);
      break;
    case 'report-bam':
      runReportBam(mod, rest);
      break;
    case 'report-cram':
      runReportCram(mod, rest);
      break;
    default:
      // Back-compat: if the first arg looks like a path, treat the whole
      // argv as the old `<file> [optionsJson]` form.
      if (!subcommand.startsWith('--')) {
        runInspect(mod, args);
      } else {
        console.error(`unknown subcommand: ${subcommand}`);
        process.exit(1);
      }
  }
}

main();
