# Browser Compatibility Completion Audit

This audit maps the cross-browser WASM compatibility TODO to concrete evidence
in the repository. Full completion means `npm run check:browser-compat-completion`
passes against merged local, historical, Android, and iOS compatibility results.

## Objective

Verify the WASM web app by running one representative demo/report happy path
across desktop and mobile browsers, record browser/version capability evidence,
derive minimum supported browser versions, and surface the support policy in the
UI.

## Evidence Checklist

| Requirement | Evidence | Current status |
| --- | --- | --- |
| Focused happy-path compatibility spec | `.maestro-web/lab-wasm-compat.spec.ts` | Implemented |
| Shared report-flow helpers | `.maestro-web/lab-report-matrix-helpers.ts` | Implemented |
| Desktop Chromium/Firefox/WebKit projects | `.maestro-web/playwright.config.ts`, `test-web-compat.sh` | Implemented |
| Machine-readable result matrix | `test-output/browser-compat/results.json` | Implemented locally |
| Human-readable result summary | `test-output/browser-compat/results.md` | Implemented locally |
| Runtime capability probes | `.maestro-web/lab-wasm-compat.spec.ts`, `lib/browser-support.ts` | Implemented |
| Historical browser version runner | `scripts/run-browser-version-matrix.mjs`, `tests/browser-compat-version-matrix.yaml` | Implemented |
| Android local emulator runner | `scripts/run-local-android-browser-compat.mjs` | Implemented |
| Real provider matrix runner | `scripts/run-remote-browser-compat-matrix.mjs`, `tests/browser-compat-remote-matrix.yaml` | Implemented |
| Remote provider smoke wrapper | `test-web-compat-remote.sh`, `scripts/test-web-compat-remote-wrapper.test.mjs` | Implemented |
| Provider endpoint renderer/templates | `scripts/render-browser-compat-endpoints.mjs`, `tests/browser-compat-provider-capabilities.example.json`, `tests/browser-compat-remote-endpoints.example.json` | Implemented |
| Provider endpoint and URL preflight | `scripts/check-browser-compat-provider-secret.mjs`, `scripts/check-browser-compat-infra.mjs`, `npm run check:browser-compat-provider-secret`, `npm run check:browser-compat-infra` | Implemented; fails until real endpoint JSON file, env var, or repo secret is available, and rejects missing/local-only `WEB_URL` for required provider runs |
| Generated browser support policy | `lib/browser-support.generated.ts` | Implemented for available evidence |
| UI browser support assessment | `lib/browser-support.ts`, `app/(tabs)/lab/index.web.tsx` | Implemented |
| TODO evidence updater | `scripts/update-browser-compat-todo.mjs` | Implemented |
| Strict completion audit | `scripts/check-browser-compat-completion.mjs`, `tests/browser-compat-completion.yaml` | Implemented |
| CI compatibility jobs | `.github/workflows/ci.yml` | Implemented |
| Provider operator runbook | `docs/browser-compat-provider-runs.md` | Implemented |
| Browser compatibility docs drift check | `scripts/check-browser-compat-docs.mjs`, `npm run check:browser-compat-docs` | Implemented |
| Browser compatibility static suite | `npm run test:browser-compat-static` | Implemented |

## Prompt-to-Artifact Checklist

| TODO item | Required deliverable | Verifier or evidence | Current status |
| --- | --- | --- | --- |
| 1. Define the Happy Path | One representative PGx report flow that imports the demo genome, completes the WASM report, validates `observations.tsv`, `analysis.jsonl`, `reports.jsonl`, `index.html`, checks iframe text, and fails on relevant console/page errors | `.maestro-web/lab-wasm-compat.spec.ts`, `.maestro-web/lab-report-matrix-helpers.ts`, `npm run test:web-compat` | Implemented for local/provider runners |
| 2. Add a Focused Compatibility Spec | Narrow compatibility spec using `WEB_COMPAT_SAMPLE_ID`, `WEB_COMPAT_BROWSER`, `WEB_COMPAT_RESULT_TIMEOUT_MS`, and `WEB_COMPAT_STRICT_ARTIFACTS` | `.maestro-web/lab-wasm-compat.spec.ts`, `.maestro-web/playwright.config.ts` | Implemented |
| 3. Expand Desktop Browser Coverage | Chromium, Firefox, WebKit, mobile Chromium emulation, and mobile Firefox viewport projects with local/secure-origin script support | `.maestro-web/playwright.config.ts`, `test-web-compat.sh`, `test-web.sh` | Implemented and represented in current local results |
| 4. Record a Browser/Version Result Matrix | Machine-readable `results.json`, Markdown summary, complete result rows, source-tagged evidence, target-specific validators, merge dedupe by `remoteTargetId`, and infrastructure preflight | `test-output/browser-compat/results.json`, `test-output/browser-compat/results.md`, `npm run check:browser-compat-results`, `npm run merge:browser-compat-results`, `npm run check:browser-compat-infra` | Implemented; current matrix has 20 local/historical/Android-local rows |
| 5. Add Runtime Capability Probes | Runtime probes for WASM, workers, module workers, Blob/File APIs, fetch/streams, storage, secure context, and crypto | `.maestro-web/lab-wasm-compat.spec.ts`, `modules/expo-bioscript/src/ExpoBioscriptWebRuntime.ts`, `lib/browser-support.ts`, `npm run test:browser-support` | Implemented |
| 6. Determine Minimum Browser Requirements | Latest desktop engines plus older browser brackets with minimum known-good and known-failing versions | `scripts/run-browser-version-matrix.mjs`, `tests/browser-compat-version-matrix.yaml`, `lib/browser-support.generated.ts`, `npm run check:browser-version-matrix` | Implemented for Chromium, Firefox, and WebKit/Safari local/historical evidence |
| 7. Android Mobile Browser Testing | Android-local runner plus real provider evidence for Chrome latest, Chrome previous, Firefox latest, and Samsung Internet latest | `scripts/run-local-android-browser-compat.mjs`, `scripts/run-remote-browser-compat-matrix.mjs`, `test-web-compat-remote.sh`, `tests/browser-compat-remote-matrix.yaml`, `npm run test:web-compat-remote-wrapper`, `npm run check:browser-compat-completion` | Local Android Chrome implemented; required provider rows missing |
| 8. iOS Mobile Browser Testing | Deferred iOS provider/macOS evidence for Safari latest, Safari oldest-supported, Chrome iOS latest, and Firefox iOS latest | `tests/browser-compat-remote-matrix.yaml`, `test-web-compat-remote.sh`, `npm run test:web-compat:remote-ios`, `npm run test:web-compat-remote-wrapper`, `npm run check:browser-compat-completion` | Provider runner implemented; required provider rows missing |
| 9. Bake Requirements Into the UI | Central policy module, required/optional capabilities, hard block for missing runtime capabilities, warnings for below-minimum/untested browser versions | `lib/browser-support.ts`, `lib/browser-support.generated.ts`, `app/(tabs)/lab/index.web.tsx`, `npm run check:browser-support` | Implemented for current evidence; provider-only families remain `None` until real rows exist |
| 10. CI Integration | Lightweight PR smoke, scheduled/manual compatibility workflow, provider jobs, artifact upload, merge/update/docs-check/completion audit path | `.github/workflows/ci.yml`, `npm run test:browser-compat-static`, `npm run check:browser-compat-docs` | Implemented; provider job is blocked until endpoint secret exists |

## Current Verified Local Evidence

Current local evidence is in `test-output/browser-compat/results.json` and
contains passing rows for latest desktop Chromium, Firefox, WebKit, mobile
emulation, local Android Chrome, and historical minimum-bracket rows.

Generated policy currently has minimum known-good brackets for:

- Chromium: 97, with known failures at 94 and 96.
- Firefox: 127, with known failure at 99.
- Safari/WebKit: 17, with known failure at 15.

## Blocking Evidence

The following rows are required by `tests/browser-compat-completion.yaml` and
are not present in `test-output/browser-compat/results.json` as passing
`remote-provider` rows:

- `android-chrome-latest`
- `android-chrome-previous`
- `android-firefox-latest`
- `android-samsung-internet-latest`
- `ios-safari-latest`
- `ios-safari-oldest-supported`
- `ios-chrome-latest`
- `ios-firefox-latest`

These rows require real provider WebSocket endpoints via either
`WEB_COMPAT_REMOTE_ENDPOINTS_JSON`/`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON`,
an auto-detected repo-root `browser-compat-endpoints.json`, or
`WEB_COMPAT_REMOTE_ENDPOINTS_FILE`/`BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE`.
In CI, the manual `web-compat-remote` job can also render a runner-temp
endpoint file from provider credential secrets when endpoint JSON is absent:
`BROWSERSTACK_USERNAME` plus `BROWSERSTACK_ACCESS_KEY`, or `LT_USERNAME` plus
`LT_ACCESS_KEY`, using `tests/browser-compat-provider-capabilities.example.json`.
Endpoint JSON is validated against the same target set that the remote provider
run would execute: all Android targets by default, selected targets when
`WEB_COMPAT_REMOTE_TARGETS` is set, and deferred iOS targets only when
`WEB_COMPAT_INCLUDE_DEFERRED=1` is set.
When remote Android or iOS targets are required, the infrastructure preflight
also validates `WEB_URL` so missing or local-only values fail before opening
provider sessions; `WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1` is reserved for provider
tunnel runs that intentionally map a local app URL.
Passing provider rows must also include complete run metadata, a complete
runtime capability probe, passing report/artifact status, clean relevant
console/page evidence, matching remote target metadata, matching provider
device name and OS version from `tests/browser-compat-remote-matrix.yaml`,
`artifactNames`, a matching result `browserName`, and a matching user-agent
before policy generation, TODO updating, or strict completion will trust them.
`results.md` is checked with
`results.json` so the human summary row count matches the machine-readable
rows; staged audits can override the expected sample, required artifacts,
Markdown summary file, and Markdown requirement with `WEB_COMPAT_REQUIRED_SAMPLE_ID`,
`WEB_COMPAT_REQUIRED_ARTIFACTS`, `WEB_COMPAT_RESULTS_MD_FILE`, and
`WEB_COMPAT_REQUIRE_RESULTS_MD`.

Current repository/environment audit:

- Provider endpoint setup and real Android/iOS evidence collection are tracked
  in [issue #66](https://github.com/OpenMined/biovault-app/issues/66).
- The local shell has no `WEB_COMPAT_REMOTE_ENDPOINTS_*`,
  `BROWSER_COMPAT_REMOTE_ENDPOINTS_*`, `BROWSERSTACK_*`, `LT_*`,
  `LAMBDATEST_*`, or `SAUCE_*` endpoint variables.
- The deployed web app is reachable at `https://app.biovault.net/web/`;
  supplying it as `WEB_URL` with `WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1` makes
  the remote infrastructure preflight report `WEB_URL: available`.
- The repo root has no `browser-compat-endpoints.json` file for the local
  provider endpoint auto-detection path.
- The repository has no environments or variables, and the only repository
  secret visible to this token is `CLOUDFLARE_API_TOKEN`. Organization
  secrets/variables cannot be inspected with this token, but the latest
  provider dry-run received empty `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON`,
  `BROWSERSTACK_USERNAME`, `BROWSERSTACK_ACCESS_KEY`, `LT_USERNAME`, and
  `LT_ACCESS_KEY` values.
- `test-output/browser-compat/results.json` currently contains local,
  historical, and `android-local` rows only; it has no passing
  `remote-provider` rows for the Android/iOS target ids listed above.
- With no local endpoint input available,
  `WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-provider-secret`
  reports the missing `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` provider endpoint
  input and lists all eight Android/iOS endpoint target ids required for full
  completion. The endpoint input can come from env JSON, a local endpoint file,
  a repo-root `browser-compat-endpoints.json`, a CI-visible endpoint JSON
  secret, or CI-visible BrowserStack/LambdaTest credential secrets that render
  endpoint JSON inside the manual remote workflow.
- The full remote infrastructure preflight,
  `WEB_URL=https://app.biovault.net/web/ WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1 WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1 WEB_COMPAT_REQUIRE_REMOTE_IOS=1 WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-infra`,
  accepts the provider-reachable `WEB_URL` and still reports the missing
  Android/iOS endpoints.
- The live `main` GitHub Actions workflow passes
  `WEB_COMPAT_PROVIDER_REF=main npm run check:browser-compat-provider-workflow`,
  so CI provider runs can be dispatched from `main` once endpoint JSON or a
  complete provider credential pair is available. A safe
  `compat_remote_dry_run=true` workflow dispatch on `main` ran the provider
  credential render fallback, found no endpoint JSON or BrowserStack/LambdaTest
  credential pair, then reached `Check remote browser provider secret` and
  failed before fixture fetch or provider browser launch.
- Remote matrix dry-runs pass for both the default Android target set and the
  full Android+iOS target set using
  `tests/browser-compat-remote-endpoints.example.json`, which verifies target
  selection and endpoint parsing but does not produce real browser evidence.

## Audit Commands

Run these after producing and merging provider evidence:

```sh
npm run test:browser-compat-static
WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-provider-secret
npm run check:browser-compat-results
npm run update:browser-support
npm run update:browser-compat-todo
npm run check:browser-support
npm run check:browser-compat-docs
npm run check:browser-compat-completion
```

The current expected blocker check is:

```sh
WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-provider-secret
WEB_URL=https://app.biovault.net/web/ WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1 WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1 WEB_COMPAT_REQUIRE_REMOTE_IOS=1 WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-infra
```

These fail until the provider endpoint secret, local endpoint JSON env var,
repo-root `browser-compat-endpoints.json`, or local endpoint JSON file is
available.
