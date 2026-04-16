#!/usr/bin/env node
// Diagnostic CLI: drives the bioscript-wasm module (nodejs target) against
// local files without Metro or a browser. Two modes:
//
//   inspect <file> [optionsJson]
//       → calls inspectBytes with the whole file in memory.
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
// wasm-pack is invoked with --target nodejs into pkg-node/ on every run;
// cargo handles the incremental caching so this is near-free when nothing
// changed. Pass RUN_BIOSCRIPT_WASM_NO_BUILD=1 to skip the rebuild.

'use strict';

const { openSync, readFileSync, readSync, existsSync, fstatSync, closeSync } = require('node:fs');
const { basename, resolve, join } = require('node:path');
const { execFileSync } = require('node:child_process');

const CRATE_DIR = resolve(__dirname, '..', '..', '..', 'bioscript', 'rust', 'bioscript-wasm');
const PKG_DIR = join(CRATE_DIR, 'pkg-node');
const PKG_JS = join(PKG_DIR, 'bioscript_wasm.js');

function buildIfNeeded() {
  if (process.env.RUN_BIOSCRIPT_WASM_NO_BUILD === '1' && existsSync(PKG_JS)) {
    return;
  }
  try {
    execFileSync('wasm-pack', ['build', '--target', 'nodejs', '--release', '--out-dir', 'pkg-node'], {
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

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('usage:');
    console.error('  run-bioscript-wasm.cjs inspect <file> [optionsJson]');
    console.error(
      '  run-bioscript-wasm.cjs cram --cram <x.cram> --crai <x.cram.crai> \\',
    );
    console.error("      --fasta <ref.fa> --fai <ref.fa.fai> --variants '<json>'");
    process.exit(1);
  }

  buildIfNeeded();
  const mod = require(PKG_JS);

  const [subcommand, ...rest] = args;
  switch (subcommand) {
    case 'inspect':
      runInspect(mod, rest);
      break;
    case 'cram':
      runCram(mod, rest);
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
