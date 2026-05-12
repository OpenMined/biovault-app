import { closeSync, cpSync, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const sourceDir = 'dist';
const deployDir = 'dist-cloudflare';
const webDir = join(deployDir, 'web');
const maxAssetBytes = 20 * 1024 * 1024;

rmSync(deployDir, { force: true, recursive: true });
mkdirSync(webDir, { recursive: true });
cpSync(sourceDir, webDir, { recursive: true });
writeFileSync(join(deployDir, 'index.html'), landingPageHtml());

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

function landingPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BioVault</title>
  <style>
    :root {
      color-scheme: dark;
      background: #272532;
      color: #f7f4ef;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at 12% 16%, rgba(83, 190, 169, 0.18), transparent 28rem), #272532;
    }
    main {
      width: min(1040px, calc(100% - 40px));
      min-height: 100vh;
      margin: 0 auto;
      display: grid;
      grid-template-rows: 1fr auto;
      gap: 44px;
      padding: 56px 0;
    }
    .hero {
      display: grid;
      align-content: center;
      justify-items: start;
    }
    .eyebrow {
      color: #53bea9;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1 {
      max-width: 760px;
      margin: 10px 0 0;
      font-size: clamp(44px, 8vw, 76px);
      line-height: 0.95;
      letter-spacing: 0;
    }
    p {
      max-width: 680px;
      margin: 18px 0 0;
      color: #d8d3df;
      font-size: 18px;
      line-height: 1.6;
    }
    .primary-action {
      display: inline-grid;
      min-height: 72px;
      margin-top: 34px;
      align-content: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      padding: 18px 28px;
      color: #f7f4ef;
      text-decoration: none;
      background: #53bea9;
      box-shadow: 0 18px 48px rgba(83, 190, 169, 0.24);
    }
    .primary-action strong {
      display: block;
      color: #17161d;
      font-size: 20px;
      line-height: 1.1;
    }
    .primary-action span {
      display: block;
      margin-top: 6px;
      color: rgba(23, 22, 29, 0.78);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
    }
    .platforms {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: center;
      justify-content: center;
      padding-top: 22px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .platform {
      width: 118px;
      min-height: 88px;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: rgba(247, 244, 239, 0.38);
      background: rgba(255, 255, 255, 0.035);
      cursor: not-allowed;
      filter: grayscale(1);
      opacity: 0.62;
      user-select: none;
    }
    .platform svg {
      width: 28px;
      height: 28px;
      color: rgba(247, 244, 239, 0.44);
    }
    .platform span {
      font-size: 13px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">BioVault</div>
      <h1>Private genomic analysis on your device.</h1>
      <p>Run genomic analysis locally in your browser. Desktop and mobile apps are coming next.</p>
      <a class="primary-action" href="/web/"><strong>Run in Browser</strong><span>WASM / Rust</span></a>
    </section>
    <nav class="platforms" aria-label="Coming soon platforms" aria-disabled="true">
      <div class="platform" aria-disabled="true">${appleIcon()}<span>Mac</span></div>
      <div class="platform" aria-disabled="true">${windowsIcon()}<span>Windows</span></div>
      <div class="platform" aria-disabled="true">${linuxIcon()}<span>Linux</span></div>
      <div class="platform" aria-disabled="true">${phoneIcon()}<span>iOS</span></div>
      <div class="platform" aria-disabled="true">${androidIcon()}<span>Android</span></div>
    </nav>
  </main>
</body>
</html>
`;
}

function appleIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.7 13.1c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.2 1.9-1.4 2.4-.4 5.9 1 7.8.7.9 1.5 2 2.5 1.9 1 0 1.4-.6 2.6-.6s1.6.6 2.6.6c1.1 0 1.8-1 2.5-1.9.8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.1ZM14.7 7.1c.6-.7.9-1.6.8-2.5-.8 0-1.8.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.8.1 1.7-.4 2.3-1.1Z"/></svg>`;
}

function windowsIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5.2 10.7 4v7.4H3V5.2Zm8.6-1.3L21 2.5v8.9h-9.4V3.9ZM3 12.6h7.7V20L3 18.8v-6.2Zm8.6 0H21v8.9l-9.4-1.4v-7.5Z"/></svg>`;
}

function linuxIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c-2.3 0-3.8 1.9-3.8 4.4 0 1.5.4 2.8-.5 4.2-.7 1.1-2 3.1-2.5 5.1-.5 1.8.2 3.5 1.6 4.1 1.1.5 2.3.1 3.1-.5.7.4 1.4.6 2.1.6s1.4-.2 2.1-.6c.8.6 2 .9 3.1.5 1.4-.6 2.1-2.3 1.6-4.1-.5-2-1.8-4-2.5-5.1-.9-1.4-.5-2.7-.5-4.2C15.8 3.9 14.3 2 12 2Zm-1.3 4.1c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9Zm2.6 0c.4 0 .7.4.7.9s-.3.9-.7.9-.7-.4-.7-.9.3-.9.7-.9Zm-1.3 3c.7 0 1.4.3 1.8.8-.5.3-1.1.5-1.8.5s-1.3-.2-1.8-.5c.4-.5 1.1-.8 1.8-.8Z"/></svg>`;
}

function phoneIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 2.5h8A2.5 2.5 0 0 1 18.5 5v14A2.5 2.5 0 0 1 16 21.5H8A2.5 2.5 0 0 1 5.5 19V5A2.5 2.5 0 0 1 8 2.5Zm0 2V18h8V4.5H8Zm3.2 15h1.6a.7.7 0 0 0 0-1.4h-1.6a.7.7 0 0 0 0 1.4Z"/></svg>`;
}

function androidIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m8 6.2-1.3-2a.6.6 0 0 1 1-.6L9 5.8a7.6 7.6 0 0 1 6 0l1.3-2.2a.6.6 0 0 1 1 .6l-1.3 2A6.8 6.8 0 0 1 18.8 11H5.2A6.8 6.8 0 0 1 8 6.2ZM8.6 8.7a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Zm6.8 0a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6ZM5.3 12.2h13.4v5.3A2.5 2.5 0 0 1 16.2 20H7.8a2.5 2.5 0 0 1-2.5-2.5v-5.3Z"/></svg>`;
}
