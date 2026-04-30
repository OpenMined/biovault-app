import { closeSync, cpSync, openSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const sourceDir = 'dist';
const deployDir = 'dist-cloudflare';
const maxAssetBytes = 20 * 1024 * 1024;

rmSync(deployDir, { force: true, recursive: true });
cpSync(sourceDir, deployDir, { recursive: true });

let splitCount = 0;

for (const filePath of walkFiles(deployDir)) {
  const stat = statSync(filePath);
  if (stat.size <= maxAssetBytes) continue;

  const manifest = splitAsset(filePath, stat.size);
  writeFileSync(`${filePath}.chunks.json`, `${JSON.stringify(manifest)}\n`);
  rmSync(filePath);
  splitCount += 1;
}

console.log(
  splitCount === 0
    ? '[prepare-cloudflare-web] no assets needed splitting'
    : `[prepare-cloudflare-web] split ${splitCount} oversized asset(s) into <= ${maxAssetBytes} byte chunks`,
);

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath);
    } else if (entry.isFile()) {
      yield entryPath;
    }
  }
}

function splitAsset(filePath, totalSize) {
  const chunkNames = [];
  const input = openSync(filePath, 'r');
  let offset = 0;
  let index = 0;

  try {
    while (offset < totalSize) {
      const chunkSize = Math.min(maxAssetBytes, totalSize - offset);
      const chunkName = `${basename(filePath)}.part${String(index).padStart(2, '0')}`;
      const chunkPath = `${filePath}.part${String(index).padStart(2, '0')}`;
      const buffer = Buffer.allocUnsafe(chunkSize);

      readSync(input, buffer, 0, chunkSize, offset);
      writeFileSync(chunkPath, buffer);

      chunkNames.push(chunkName);
      offset += chunkSize;
      index += 1;
    }
  } finally {
    closeSync(input);
  }

  console.log(`[prepare-cloudflare-web] split ${relative(deployDir, filePath)} into ${chunkNames.length} chunks`);

  return {
    version: 1,
    totalSize,
    chunkSize: maxAssetBytes,
    chunks: chunkNames,
  };
}
