import { execSync } from 'node:child_process';
import { readFileSync as read } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function pkgVersion() {
  // Match the version the app actually shows (Constants.expoConfig.version),
  // which is hardcoded in app.config.ts — not the package.json version.
  try {
    const cfg = read(join(repoRoot, 'app.config.ts'), 'utf8');
    const m = cfg.match(/version:\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(read(join(repoRoot, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function gitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Deterministic for a given commit (no wall clock), so `expo export` and the
// cloudflare prepare step independently derive the identical build id.
export function getBuildId() {
  const env = process.env.EXPO_PUBLIC_BUILD_ID;
  if (env) return env;
  const sha = gitShortSha();
  return sha ? `${pkgVersion()}+${sha}` : `${pkgVersion()}+dev`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stdout.write(getBuildId());
}
