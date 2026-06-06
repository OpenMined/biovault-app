import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuildId } from './build-id.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function verifiedBrowsersLine() {
  try {
    const text = readFileSync(join(repoRoot, 'lib/browser-support.generated.ts'), 'utf8');
    const match = text.match(/export const GENERATED_BROWSER_SUPPORT_POLICY = ([\s\S]*?) as const/);
    if (!match?.[1]) return null;
    const policy = JSON.parse(
      match[1]
        .replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":')
        .replace(/'/g, '"'),
    );
    const parts = [
      ['Chrome', 'chromium'],
      ['Firefox', 'firefox'],
      ['Safari', 'safari'],
    ]
      .map(([label, key]) => {
        const min = policy?.[key]?.minimumKnownGood;
        return typeof min === 'number' ? `${label} ${min}+` : null;
      })
      .filter(Boolean);
    if (!parts.length) return null;
    return `Runs locally via WebAssembly. Verified on ${parts.join(', ')}, including mobile Safari on iOS.`;
  } catch {
    return null;
  }
}

const sourceDir = 'dist';
const deployDir = 'dist-cloudflare';
const webDir = join(deployDir, 'web');
const maxAssetBytes = 20 * 1024 * 1024;
const metricsSiteId = process.env.BIOVAULT_METRICS_SITE_ID ?? '6';
const siteOrigin =
  process.env.BIOVAULT_SITE_ORIGIN ??
  `https://${process.env.BIOVAULT_METRICS_DOMAIN ?? 'app.biovault.net'}`;

export function prepareCloudflareWebAssets() {
  rmSync(deployDir, { force: true, recursive: true });
  mkdirSync(webDir, { recursive: true });
  cpSync(sourceDir, webDir, { recursive: true });

  const shareAssetsDir = 'assets/share';
  if (existsSync(shareAssetsDir)) {
    cpSync(shareAssetsDir, join(deployDir, 'images'), { recursive: true });
  }

  const guideAssetsDir = 'assets/guides';
  if (existsSync(guideAssetsDir)) {
    cpSync(guideAssetsDir, join(deployDir, 'guides'), { recursive: true });
  }

  const buildId = getBuildId();
  writeFileSync(
    join(deployDir, 'version.json'),
    `${JSON.stringify({ buildId, builtAt: new Date().toISOString() })}\n`,
  );

  writeFileSync(join(deployDir, 'index.html'), landingPageHtml());
  mkdirSync(join(deployDir, 'data-how-to'), { recursive: true });
  writeFileSync(join(deployDir, 'data-how-to', 'index.html'), dataHowToPageHtml());

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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  prepareCloudflareWebAssets();
}

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

export function landingPageHtml(options = {}) {
  const pageMetricsSiteId = options.metricsSiteId ?? metricsSiteId;
  const origin = String(options.origin ?? siteOrigin).replace(/\/+$/, '');
  const buildId = String(options.buildId ?? getBuildId());
  const browserSupport = verifiedBrowsersLine();
  const metricsScriptUrl = options.metricsScriptCacheBust
    ? `https://metrics.syftbox.net/api/script.js?v=${encodeURIComponent(String(options.metricsScriptCacheBust))}`
    : 'https://metrics.syftbox.net/api/script.js';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <style>html{background:#272532;color:#f7f4ef}</style>
  <title>BioVault — Your DNA never leaves your browser</title>
  <meta name="description" content="Run private genomic analysis locally on your device. No upload, no account, fully open source.">
  <link rel="canonical" href="${origin}/">
  <link rel="icon" type="image/png" sizes="32x32" href="${origin}/images/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${origin}/images/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="${origin}/images/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${origin}/">
  <meta property="og:title" content="BioVault — Your DNA never leaves your browser">
  <meta property="og:description" content="Run private genomic analysis locally on your device. No upload, no account, fully open source.">
  <meta property="og:image" content="${origin}/images/og-share-square.jpg">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="800">
  <meta property="og:image" content="${origin}/images/og-share.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="BioVault — Your DNA never leaves your browser">
  <meta name="twitter:description" content="Run private genomic analysis locally on your device. No upload, no account, fully open source.">
  <meta name="twitter:image" content="${origin}/images/og-share.jpg">
  <script src="${escapeHtml(metricsScriptUrl)}" data-site-id="${escapeHtml(pageMetricsSiteId)}" defer></script>
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
      grid-template-rows: auto 1fr auto;
      gap: 34px;
      padding: 56px 0;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      color: #53bea9;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .contact-link {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 0 16px;
      color: #f7f4ef;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.05);
      font-size: 14px;
      font-weight: 700;
    }
    .hero {
      display: grid;
      align-content: center;
      justify-items: start;
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
      align-content: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      padding: 18px 28px;
      color: #f7f4ef;
      text-decoration: none;
      background: #53bea9;
      box-shadow: 0 18px 48px rgba(83, 190, 169, 0.24);
      position: relative;
      overflow: hidden;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 14px;
      margin-top: 34px;
    }
    .secondary-action,
    .email-action {
      display: inline-grid;
      min-height: 72px;
      align-content: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      padding: 18px 24px;
      color: #f7f4ef;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.06);
    }
    .email-action {
      font: inherit;
      text-align: left;
      cursor: pointer;
      color: #17161d;
      background: #ffd87a;
      border-color: rgba(255, 216, 122, 0.56);
      box-shadow: 0 18px 48px rgba(255, 216, 122, 0.2);
      position: relative;
      overflow: hidden;
    }
    .secondary-action:hover,
    .secondary-action:focus-visible {
      border-color: rgba(83, 190, 169, 0.44);
      background: rgba(83, 190, 169, 0.09);
      outline: none;
    }
    .email-action:hover,
    .email-action:focus-visible {
      border-color: rgba(255, 216, 122, 0.82);
      background: #ffe39b;
      outline: none;
    }
    .primary-action::after,
    .email-action::after {
      content: "";
      position: absolute;
      inset: 0;
      transform: translateX(-120%);
      background: linear-gradient(
        110deg,
        transparent 30%,
        rgba(255, 255, 255, 0.55) 50%,
        transparent 70%
      );
      pointer-events: none;
    }
    .primary-action:hover::after,
    .primary-action:focus-visible::after,
    .email-action:hover::after,
    .email-action:focus-visible::after {
      animation: primary-action-shimmer 1.25s ease-in-out infinite;
    }
    @keyframes primary-action-shimmer {
      to { transform: translateX(120%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .primary-action:hover::after,
      .primary-action:focus-visible::after,
      .email-action:hover::after,
      .email-action:focus-visible::after {
        animation: none;
      }
    }
    .primary-action strong {
      display: block;
      position: relative;
      z-index: 1;
      color: #17161d;
      font-size: 20px;
      line-height: 1.1;
    }
    .primary-action span {
      display: block;
      position: relative;
      z-index: 1;
      margin-top: 6px;
      color: rgba(23, 22, 29, 0.78);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
    }
    .secondary-action strong {
      display: block;
      color: #f7f4ef;
      font-size: 18px;
      line-height: 1.1;
    }
    .secondary-action span {
      display: block;
      margin-top: 6px;
      color: rgba(247, 244, 239, 0.68);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
    }
    .email-action strong {
      display: block;
      position: relative;
      z-index: 1;
      color: #17161d;
      font-size: 18px;
      line-height: 1.1;
    }
    .email-action span {
      display: block;
      position: relative;
      z-index: 1;
      margin-top: 6px;
      color: rgba(23, 22, 29, 0.74);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
    }
    .email-modal[hidden] {
      display: none;
    }
    .email-modal {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 22px;
    }
	    .email-backdrop {
	      position: absolute;
	      inset: 0;
	      border: 0;
	      background: rgba(0, 0, 0, 0.64);
	      cursor: pointer;
	    }
	    .email-panel {
	      position: relative;
	      width: min(520px, 100%);
	      border: 1px solid rgba(255, 200, 80, 0.3);
	      border-radius: 8px;
	      padding: 24px;
	      background: #151817;
	      box-shadow: 0 26px 80px rgba(0, 0, 0, 0.42);
	    }
	    .email-heading {
	      display: flex;
	      align-items: flex-start;
	      gap: 12px;
	      padding-right: 46px;
	    }
	    .email-icon {
	      width: 42px;
	      height: 42px;
	      display: inline-grid;
	      place-items: center;
	      flex: 0 0 auto;
	      border: 1px solid rgba(255, 200, 80, 0.3);
	      border-radius: 999px;
	      color: #ffd87a;
	      background: rgba(255, 200, 80, 0.1);
	    }
	    .email-icon svg {
	      width: 21px;
	      height: 21px;
	    }
	    .email-kicker {
	      margin: 0 0 4px;
	      color: #ffd87a;
	      font-size: 11px;
	      font-weight: 800;
	      letter-spacing: 0.8px;
	      text-transform: uppercase;
	    }
	    .email-panel h2 {
	      margin: 0;
	      color: #f7f4ef;
	      font-size: 28px;
	      line-height: 1.15;
	      letter-spacing: 0;
	    }
	    .email-panel p {
	      margin: 8px 0 0;
	      font-size: 15px;
	      line-height: 1.5;
	      color: rgba(247, 244, 239, 0.68);
	    }
	    .email-close {
	      position: absolute;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      color: #f7f4ef;
      background: rgba(255, 255, 255, 0.05);
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
    }
	    .email-form {
	      display: grid;
	      gap: 12px;
	      margin-top: 22px;
	    }
	    .email-input {
	      width: 100%;
	      min-height: 52px;
	      border: 1px solid rgba(219, 226, 221, 0.22);
	      border-radius: 8px;
	      padding: 0 16px;
	      color: #f7f4ef;
	      background: #202423;
	      font: inherit;
	      font-size: 16px;
	    }
	    .email-input:focus {
	      border-color: rgba(255, 200, 80, 0.42);
	      outline: none;
	      box-shadow: 0 0 0 3px rgba(255, 200, 80, 0.16);
	    }
	    .email-submit {
	      min-height: 52px;
	      border: 1px solid rgba(255, 200, 80, 0.3);
	      border-radius: 8px;
	      color: #07100b;
	      background: #ffd87a;
	      cursor: pointer;
	      font: inherit;
	      font-size: 15px;
      font-weight: 800;
    }
    .email-submit:disabled {
      cursor: not-allowed;
      opacity: 0.62;
    }
    .email-message {
      min-height: 22px;
      margin-top: 4px;
      color: rgba(247, 244, 239, 0.72);
      font-size: 14px;
      line-height: 1.45;
    }
    .email-message.error {
      color: #ffb7c2;
    }
	    .email-message.success {
	      color: #8ee7b8;
	    }
    .build-tag {
      margin-top: 12px;
      margin-left: 6px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: rgba(247, 244, 239, 0.4);
    }
    .browser-support {
      max-width: 680px;
      margin: 6px 0 0;
      margin-left: 6px;
      font-size: 11px;
      line-height: 1.4;
      color: rgba(247, 244, 239, 0.38);
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
    .brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .beta {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #17161d;
      background: #53bea9;
      padding: 2px 7px;
      border-radius: 4px;
    }
    .footer-note {
      margin-top: 18px;
      text-align: center;
      color: rgba(247, 244, 239, 0.52);
      font-size: 14px;
    }
    .footer-note a {
      color: #53bea9;
      font-weight: 700;
      text-decoration: none;
    }
    @media (max-width: 520px) {
      main {
        width: min(100% - 28px, 1040px);
        padding: 28px 0;
      }
      .topbar {
        align-items: flex-start;
      }
      .contact-link {
        padding: 0 12px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header class="topbar">
      <div class="brand-row">
        <span class="brand">BioVault</span>
        <span class="beta">Beta</span>
      </div>
      <a class="contact-link" href="mailto:contact@biovault.net">Contact</a>
    </header>
    <section class="hero">
      <h1>Discover more from your genetic data, privately.</h1>
      <p>Drag and drop a 23andMe, Ancestry, or VCF file to explore genetic reports. All analysis runs locally in your browser. Desktop and mobile apps are coming next.</p>
      <div class="hero-actions">
        <a class="primary-action" href="/web/"><strong>Run in Browser</strong><span>WASM / Rust</span></a>
        <a
          class="secondary-action"
          href="/data-how-to/"
          data-track-event="landing_data_how_to_clicked"
          data-track-properties='{"target":"/data-how-to/","label":"Download your Data","source":"landing_hero"}'
        ><strong>Download your Data</strong><span>Guides on 23andMe and others</span></a>
        <button
          class="email-action"
          type="button"
	          data-open-email-modal
	          data-track-event="landing_email_updates_clicked"
	          data-track-properties='{"label":"Subscribe","source":"landing_hero"}'
	        ><strong>Subscribe</strong><span>Get BioVault updates</span></button>
      </div>
      <div class="build-tag">Build ${escapeHtml(buildId)}</div>
      ${browserSupport ? `<p class="browser-support">${escapeHtml(browserSupport)}</p>` : ''}
    </section>
    <footer>
      <nav class="platforms" aria-label="Coming soon platforms" aria-disabled="true">
        <div class="platform" aria-disabled="true">${appleIcon()}<span>Mac</span></div>
        <div class="platform" aria-disabled="true">${windowsIcon()}<span>Windows</span></div>
        <div class="platform" aria-disabled="true">${linuxIcon()}<span>Linux</span></div>
        <div class="platform" aria-disabled="true">${phoneIcon()}<span>iOS</span></div>
        <div class="platform" aria-disabled="true">${androidIcon()}<span>Android</span></div>
      </nav>
      <div class="footer-note">
        <a href="mailto:contact@biovault.net?subject=BioVault%20Feedback%20or%20Feature%20Request">Feedback or Request a Feature</a>
      </div>
    </footer>
  </main>
  <div class="email-modal" data-email-modal hidden>
    <button class="email-backdrop" type="button" data-close-email-modal aria-label="Close email updates dialog"></button>
	    <section class="email-panel" role="dialog" aria-modal="true" aria-labelledby="email-updates-title">
	      <button class="email-close" type="button" data-close-email-modal aria-label="Close">×</button>
	      <div class="email-heading">
	        <span class="email-icon" aria-hidden="true">
	          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
	            <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
	            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
	          </svg>
	        </span>
	        <div>
	          <div class="email-kicker">Newsletter</div>
	          <h2 id="email-updates-title">Get BioVault updates</h2>
	          <p>Product updates, assay releases, and research notes from the BioVault team.</p>
	        </div>
	      </div>
	      <form class="email-form" data-email-form>
	        <input class="email-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
	        <button class="email-submit" type="submit">Join newsletter</button>
	        <div class="email-message" data-email-message role="status" aria-live="polite"></div>
	      </form>
    </section>
  </div>
  <script>
    (() => {
      const endpoint = 'https://metrics.syftbox.net/api/track';
      const siteId = ${JSON.stringify(String(pageMetricsSiteId))};
      const track = (eventName, properties) => {
        try {
          if (window.rybbit && typeof window.rybbit.event === 'function') {
            window.rybbit.event(eventName, properties);
            return;
          }
          const payload = {
            type: 'custom_event',
            site_id: siteId,
            hostname: window.location.hostname,
            pathname: window.location.pathname || '/',
            querystring: window.location.search.replace(/^\\?/, ''),
            screenWidth: window.innerWidth || 0,
            screenHeight: window.innerHeight || 0,
            language: navigator.language || 'en-US',
            page_title: document.title || '',
            referrer: document.referrer || '',
            event_name: eventName,
            properties: JSON.stringify(properties || {}),
          };
          const body = JSON.stringify(payload);
          if (navigator.sendBeacon) {
            navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
          } else {
            fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
              body,
              keepalive: true,
            }).catch(() => {});
          }
        } catch {
          // Analytics must never block navigation.
        }
      };
      document.querySelectorAll('[data-track-event]').forEach((element) => {
        element.addEventListener('click', () => {
          let properties = {};
          try {
            properties = JSON.parse(element.getAttribute('data-track-properties') || '{}');
          } catch {}
          track(element.getAttribute('data-track-event'), properties);
        });
      });

      const modal = document.querySelector('[data-email-modal]');
      const form = document.querySelector('[data-email-form]');
      const input = form?.querySelector('input[name="email"]');
      const submit = form?.querySelector('button[type="submit"]');
      const message = document.querySelector('[data-email-message]');
      let successCloseTimer;
      const clearSuccessCloseTimer = () => {
        if (successCloseTimer) {
          clearTimeout(successCloseTimer);
          successCloseTimer = undefined;
        }
      };
      const setMessage = (text, tone) => {
        if (!message) return;
        message.textContent = text;
        message.className = 'email-message' + (tone ? ' ' + tone : '');
      };
      const openModal = () => {
        if (!modal) return;
        clearSuccessCloseTimer();
        modal.hidden = false;
        setMessage('', '');
        setTimeout(() => input?.focus(), 0);
      };
      const closeModal = () => {
        if (!modal) return;
        clearSuccessCloseTimer();
        modal.hidden = true;
      };
      document.querySelectorAll('[data-open-email-modal]').forEach((element) => {
        element.addEventListener('click', openModal);
      });
      document.querySelectorAll('[data-close-email-modal]').forEach((element) => {
        element.addEventListener('click', closeModal);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
      });
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = String(input?.value || '').trim();
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          setMessage('Please enter a valid email address.', 'error');
          return;
        }
        submit.disabled = true;
        setMessage('Submitting...', '');
        try {
          const response = await fetch('https://biovault.net/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              source: 'biovault-app-web-landing-hero',
              metadata: {
                buildId: ${JSON.stringify(String(buildId))},
                path: window.location.pathname || '/',
                origin: window.location.origin,
              },
            }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.ok === false || result.success === false) {
            throw new Error(result.errors?.email || result.errors?.form || result.error || 'Unable to submit right now.');
          }
          input.value = '';
          setMessage('Thanks. You are on the update list.', 'success');
          track('landing_email_updates_submitted', { source: 'landing_hero' });
          track('newsletter_signup_submitted', {
            entryPoint: 'landing-hero',
            screen: 'landing',
            source: 'biovault-app-web-landing-hero',
          });
          clearSuccessCloseTimer();
          successCloseTimer = setTimeout(() => {
            successCloseTimer = undefined;
            closeModal();
          }, 1500);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to submit right now.', 'error');
        } finally {
          submit.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>
`;
}

export function dataHowToPageHtml(options = {}) {
  const pageMetricsSiteId = options.metricsSiteId ?? metricsSiteId;
  const origin = String(options.origin ?? siteOrigin).replace(/\/+$/, '');
  const guideImage = (name) => `${origin}/guides/23andme/${name}`;
  const metricsScriptUrl = options.metricsScriptCacheBust
    ? `https://metrics.syftbox.net/api/script.js?v=${encodeURIComponent(String(options.metricsScriptCacheBust))}`
    : 'https://metrics.syftbox.net/api/script.js';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <style>html{background:#272532;color:#f7f4ef}</style>
  <title>BioVault Data How To - 23andMe Guide</title>
  <meta name="description" content="Platform-specific guides for downloading genomic data and importing it into BioVault, starting with 23andMe.">
  <link rel="canonical" href="${origin}/data-how-to/">
  <link rel="icon" type="image/png" sizes="32x32" href="${origin}/images/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${origin}/images/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="${origin}/images/apple-touch-icon.png">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${origin}/data-how-to/">
  <meta property="og:title" content="BioVault Data How To - 23andMe Guide">
  <meta property="og:description" content="Platform-specific guides for downloading genomic data and importing it into BioVault, starting with 23andMe.">
  <meta property="og:image" content="${origin}/images/og-share.jpg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="BioVault Data How To - 23andMe Guide">
  <meta name="twitter:description" content="Platform-specific guides for downloading genomic data and importing it into BioVault, starting with 23andMe.">
  <meta name="twitter:image" content="${origin}/images/og-share.jpg">
  <script src="${escapeHtml(metricsScriptUrl)}" data-site-id="${escapeHtml(pageMetricsSiteId)}" defer></script>
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
      background: radial-gradient(circle at 14% 10%, rgba(83, 190, 169, 0.16), transparent 30rem), #272532;
      background-attachment: fixed;
      background-position: top left;
    }
    main {
      width: min(1080px, calc(100% - 40px));
      margin: 0 auto;
      padding: 44px 0 64px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 54px;
    }
    .brand {
      color: #53bea9;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .nav a, .action {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 0 14px;
      color: #f7f4ef;
      text-decoration: none;
      background: rgba(255, 255, 255, 0.05);
      font-size: 14px;
      font-weight: 700;
    }
    h1 {
      max-width: 820px;
      margin: 0;
      font-size: clamp(42px, 8vw, 72px);
      line-height: 0.98;
      letter-spacing: 0;
    }
    .lead {
      max-width: 720px;
      margin: 18px 0 0;
      color: #d8d3df;
      font-size: 18px;
      line-height: 1.6;
    }
    .quick-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 26px;
    }
    .quick-nav a {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(83, 190, 169, 0.35);
      border-radius: 999px;
      padding: 0 14px;
      color: #53bea9;
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
      background: rgba(83, 190, 169, 0.08);
    }
    section {
      margin-top: 42px;
      padding-top: 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    h2 {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p, li {
      color: #d8d3df;
      font-size: 16px;
      line-height: 1.65;
    }
    ul, ol {
      margin: 0;
      padding-left: 22px;
    }
    li + li { margin-top: 10px; }
    .provider-grid, .format-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .provider-card, .format {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.05);
    }
    .provider-picker input[type="radio"] {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .provider-card-active {
      cursor: pointer;
      display: block;
    }
    .provider-card-active:hover {
      border-color: rgba(83, 190, 169, 0.55);
      background: rgba(83, 190, 169, 0.08);
    }
    #guide-23andme:checked ~ .provider-picker-grid label[for="guide-23andme"],
    #guide-sequencing:checked ~ .provider-picker-grid label[for="guide-sequencing"] {
      border-color: #53bea9;
      background: rgba(83, 190, 169, 0.13);
    }
    .provider-card.disabled {
      opacity: 0.46;
      filter: grayscale(1);
      background: rgba(255, 255, 255, 0.035);
    }
    .provider-card strong, .format strong {
      display: block;
      color: #f7f4ef;
      margin-bottom: 6px;
    }
    .provider-card span, .format span {
      display: block;
      color: #d8d3df;
      font-size: 14px;
      line-height: 1.5;
    }
    .provider-status {
      display: inline-flex !important;
      align-items: center;
      width: fit-content;
      min-height: 24px;
      margin-top: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      padding: 0 9px;
      color: rgba(247, 244, 239, 0.62);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .guide-disclosure {
      margin-top: 14px;
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.04);
    }
    .guide-disclosure summary {
      min-height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 18px;
      color: #f7f4ef;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }
    .guide-disclosure summary::-webkit-details-marker {
      display: none;
    }
    .guide-disclosure summary::after {
      content: "+";
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(83, 190, 169, 0.38);
      border-radius: 999px;
      color: #53bea9;
      font-size: 18px;
      font-weight: 700;
      flex: 0 0 auto;
    }
    .guide-disclosure[open] summary {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(83, 190, 169, 0.08);
    }
    .guide-disclosure[open] summary::after {
      content: "-";
    }
    .guide-disclosure summary strong,
    .guide-disclosure summary small {
      display: block;
    }
    .guide-disclosure summary strong {
      font-size: 18px;
      line-height: 1.25;
    }
    .guide-disclosure summary small {
      margin-top: 4px;
      color: rgba(247, 244, 239, 0.62);
      font-size: 13px;
      line-height: 1.35;
    }
    .guide-body {
      padding: 18px;
    }
    .guide-panels {
      margin-top: 18px;
    }
    .guide-panel {
      display: none;
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 8px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.04);
    }
    #guide-23andme:checked ~ .guide-panels .guide-panel-23andme,
    #guide-sequencing:checked ~ .guide-panels .guide-panel-sequencing {
      display: block;
    }
    .note {
      border-left: 3px solid #53bea9;
      padding: 14px 0 14px 16px;
      color: #d8d3df;
      background: rgba(83, 190, 169, 0.08);
    }
    .subhead {
      margin: 28px 0 12px;
      color: #f7f4ef;
      font-size: 18px;
      line-height: 1.35;
    }
    .step-list {
      display: grid;
      gap: 18px;
      margin-top: 18px;
    }
    .step {
      display: grid;
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.04);
    }
    .step.copy-only {
      grid-template-columns: 1fr;
    }
    .step h3 {
      margin: 0;
      color: #f7f4ef;
      font-size: 18px;
      line-height: 1.3;
    }
    .step p {
      margin: 8px 0 0;
      font-size: 15px;
      line-height: 1.55;
    }
    .step-number {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
      border-radius: 999px;
      color: #17161d;
      background: #53bea9;
      font-size: 13px;
      font-weight: 800;
    }
    figure {
      margin: 0;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.22);
    }
    figure img {
      display: block;
      width: 100%;
      height: auto;
    }
    figcaption {
      padding: 9px 11px;
      color: rgba(247, 244, 239, 0.62);
      font-size: 12px;
      line-height: 1.4;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .wide-shot {
      grid-column: 1 / -1;
    }
    .wide-shot img {
      max-height: 520px;
      object-fit: contain;
      background: #fff;
    }
    .phone-shot {
      max-width: 380px;
      justify-self: center;
    }
    .file-shot img {
      background: #202529;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 26px;
    }
    .action.primary {
      border-color: #53bea9;
      color: #17161d;
      background: #53bea9;
    }
    @media (max-width: 760px) {
      main { width: min(100% - 28px, 1080px); padding-top: 28px; }
      .topbar { align-items: flex-start; }
      .step { grid-template-columns: 1fr; }
      .wide-shot img { max-height: none; }
    }
  </style>
</head>
<body>
  <main>
    <header class="topbar">
      <a class="brand" href="/">BioVault</a>
      <nav class="nav" aria-label="Page links">
        <a href="/web/">Run in Browser</a>
        <a href="mailto:contact@biovault.net">Contact</a>
      </nav>
    </header>

    <article>
      <h1>Download your Data</h1>
      <p class="lead">Below are guides on where to download your genomic data files from common sequencing providers. If you have any issues please feel free to contact us.</p>
      <nav class="quick-nav" aria-label="Data guide sections">
        <a href="#import">Import into BioVault</a>
      </nav>

      <section id="guides">
        <div class="provider-picker">
          <input type="radio" id="guide-23andme" name="provider-guide" checked>
          <input type="radio" id="guide-sequencing" name="provider-guide">

          <div class="provider-grid provider-picker-grid">
            <label class="provider-card provider-card-active" for="guide-23andme"><strong>23andMe</strong><span>SNP array and imputed BCF.</span><span class="provider-status">View guide</span></label>
            <label class="provider-card provider-card-active" for="guide-sequencing"><strong>Sequencing.com</strong><span>VCF / FASTQ files.</span><span class="provider-status">View guide</span></label>
            <div class="provider-card disabled"><strong>AncestryDNA</strong><span>SNP array raw data export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>FamilyTreeDNA</strong><span>SNP array raw data export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>Genes for Good</strong><span>SNP array raw data export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>Dynamic DNA</strong><span>SNP array raw data export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>MyHeritage</strong><span>SNP array raw data export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>Dante Labs</strong><span>VCF / raw sequencing export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>Nebula Genomics</strong><span>VCF / raw sequencing export.</span><span class="provider-status">Coming soon</span></div>
            <div class="provider-card disabled"><strong>CariGenetics</strong><span>VCF / raw sequencing export.</span><span class="provider-status">Coming soon</span></div>
          </div>
          <p class="note">More guides coming soon.</p>

          <div class="guide-panels">
            <div class="guide-panel guide-panel-23andme">
              <h2>23andMe</h2>
              <p>23andMe can provide two useful downloads: your original raw genotype ZIP and the larger imputed genotype data ZIP. Request both so BioVault has the best available data for current and future assays. Use the larger <strong>imputed_genotype_data_r6</strong> file where possible.</p>

        <h3 class="subhead">Requesting Your Data</h3>
        <div class="step-list">
          <div class="step">
            <div>
              <span class="step-number">1</span>
              <h3>Open account settings</h3>
              <p>Sign in to 23andMe, open the profile menu, and choose <strong>Settings</strong>.</p>
            </div>
            <figure class="phone-shot">
              <img src="${guideImage('1-settings.jpg')}" alt="23andMe profile menu showing Settings">
              <figcaption>Open Settings from your 23andMe profile menu.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">2</span>
              <h3>Find your data access page</h3>
              <p>Scroll to the data section and choose the option to view or download your 23andMe data.</p>
            </div>
            <figure class="wide-shot">
              <img src="${guideImage('2-view-data.jpg')}" alt="23andMe settings page with View Your Data option">
              <figcaption>Look for the data access area in settings.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">3</span>
              <h3>Verify your identity</h3>
              <p>23andMe may ask for your date of birth or another account check before showing download controls.</p>
            </div>
            <figure class="wide-shot">
              <img src="${guideImage('3-dob.jpg')}" alt="23andMe verification form asking for date of birth">
              <figcaption>Complete the account verification step.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">4</span>
              <h3>Request both files</h3>
              <p>Request <strong>Raw Data</strong> and <strong>Imputed Genotype Data R6</strong>. The raw data is smaller and directly assayed; the imputed data is much larger and may support more research workflows.</p>
            </div>
            <figure class="wide-shot">
              <img src="${guideImage('4-download-request.jpg')}" alt="23andMe page with Raw Data and Imputed Genotype Data R6 request buttons">
              <figcaption>Use both download request buttons. For Imputed Genotype Data R6, check the acknowledgement box first.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">5</span>
              <h3>Wait for the email</h3>
              <p>23andMe prepares the downloads asynchronously. Wait for the email telling you the files are ready, then return to the download page.</p>
            </div>
            <figure class="wide-shot">
              <img src="${guideImage('5-email.jpg')}" alt="Email notification that 23andMe raw data is ready to download">
              <figcaption>The email confirms when the data export is available.</figcaption>
            </figure>
          </div>
        </div>

        <h3 class="subhead">Downloading Your Data</h3>
        <div class="step-list">
          <div class="step">
            <div>
              <span class="step-number">6</span>
              <h3>Download both ZIP files</h3>
              <p>Save both the original genome ZIP and the imputed genotype ZIP. Keep them zipped; BioVault can inspect ZIP files directly. Use the larger <strong>imputed_genotype_data_r6</strong> ZIP where possible.</p>
            </div>
            <figure class="file-shot">
              <img src="${guideImage('6-two-files.jpg')}" alt="Two downloaded 23andMe ZIP files">
              <figcaption>Download both files when they are ready.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">7</span>
              <h3>Move files to the device running BioVault</h3>
              <p>If the files are on another device, transfer them first. AirDrop, iCloud Drive, a USB cable, or another file transfer mechanism is fine.</p>
            </div>
            <figure>
              <img src="${guideImage('7-share-to-phone.jpg')}" alt="File sharing options for moving the 23andMe ZIP to another device">
              <figcaption>Move the ZIP files to the device where you will run BioVault.</figcaption>
            </figure>
          </div>

          <div class="step">
            <div>
              <span class="step-number">8</span>
              <h3>Optional: locate the ZIP on mobile</h3>
              <p>If you are using BioVault on iPhone or iPad, you will need to locate the downloaded ZIP in the iOS Files app when BioVault asks for genome data.</p>
            </div>
            <figure class="phone-shot">
              <img src="${guideImage('8-ios-picker.jpg')}" alt="iOS file picker showing a downloaded 23andMe ZIP file">
              <figcaption>Use the Files picker to select the downloaded ZIP.</figcaption>
            </figure>
          </div>
        </div>
            </div>

            <div class="guide-panel guide-panel-sequencing">
              <h2>Sequencing.com</h2>
            <p>Sequencing.com whole genome data is useful for BioVault when you download standard raw genome files. Start with VCF or VCF.GZ files for variant-based assays. BAM files are larger and useful for advanced workflows when paired with their index files.</p>

            <div class="step-list">
              <div class="step copy-only">
                <div>
                  <span class="step-number">1</span>
                  <h3>Sign in and open your genome files</h3>
                  <p>Sign in to Sequencing.com and open the area for your completed genome data, raw data, or downloadable genome files.</p>
                </div>
              </div>

              <div class="step copy-only">
                <div>
                  <span class="step-number">2</span>
                  <h3>Download VCF first</h3>
                  <p>Download a genome VCF or VCF.GZ file if it is available. If Sequencing.com also provides a .tbi index next to the VCF.GZ, download that companion file too.</p>
                </div>
              </div>

              <div class="step copy-only">
                <div>
                  <span class="step-number">3</span>
                  <h3>Download BAM only when needed</h3>
                  <p>For assays that need read-level alignment data, download BAM and its BAI index if available. FASTQ files are usually very large and are not the first choice for BioVault assay imports.</p>
                </div>
              </div>

              <div class="step copy-only">
                <div>
                  <span class="step-number">4</span>
                  <h3>Import the files into BioVault</h3>
                  <p>Open BioVault, choose <strong>Import genome</strong>, and select the downloaded VCF/VCF.GZ first. Add companion index files when you have them.</p>
                </div>
              </div>
            </div>

            <p class="note">Screenshots for Sequencing.com are coming next. Until then, use the provider's download area and prefer standard genomics files such as VCF, VCF.GZ, BAM, and their indexes.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="import">
        <h2>Import Into BioVault</h2>
        <ol>
          <li>Open BioVault and choose <strong>Import genome</strong>.</li>
          <li>Drop your downloaded ZIP, VCF, VCF.GZ, BAM, CRAM, or companion files into the import dialog, or click to choose them from your device.</li>
          <li>Keep the files private and local unless you intentionally paste a remote URL.</li>
          <li>Confirm the detected files, then run a compatible assay.</li>
        </ol>
      </section>

      <section>
        <h2>Supported File Types</h2>
        <div class="format-grid">
          <div class="format"><strong>23andMe text or ZIP</strong><span>Raw genotype exports and imputed genotype ZIP files.</span></div>
          <div class="format"><strong>VCF or VCF.GZ</strong><span>Variant call files from sequencing pipelines. A .tbi index can be paired when available.</span></div>
          <div class="format"><strong>BAM or CRAM</strong><span>Alignment files for advanced assays. Add the reference FASTA for CRAM and indexes when you have them.</span></div>
          <div class="format"><strong>Reference files</strong><span>FASTA, FAI, BAI, CRAI, and TBI companion files help BioVault read large datasets efficiently.</span></div>
        </div>
        <ul>
          <li>Local file imports are processed in your browser to run assays.</li>
          <li>Remote URLs are fetched only when you paste or select them.</li>
          <li>You can clear BioVault browser storage from the app settings.</li>
        </ul>
        <div class="actions">
          <a class="action primary" href="/web/">Run in Browser</a>
          <a class="action" href="mailto:contact@biovault.net?subject=BioVault%20data%20import%20question">Ask a data question</a>
        </div>
      </section>
    </article>
  </main>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
