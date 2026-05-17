# Cross-Browser WASM Compatibility TODO

Goal: verify that the web WASM app can run the app's demo/report happy path across desktop and mobile browsers, identify minimum supported browser versions, and surface those requirements in the UI.

Scope: each browser/version target runs one representative happy-path smoke test, not the full app test suite. The compatibility signal comes from that demo flow completing, expected report artifacts/results being present, runtime capability probes passing, and no relevant page/console errors being emitted.

Current blocker: the local, historical desktop, Android-emulator, and deployed web URL evidence is implemented, but full TODO completion still requires real `remote-provider` rows for the Android browser targets and the deferred iOS browser targets. Configure `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON`, export `WEB_COMPAT_REMOTE_ENDPOINTS_JSON`, set `WEB_COMPAT_REMOTE_ENDPOINTS_FILE`/`BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE`, or place `browser-compat-endpoints.json` at the repo root; use `WEB_URL=https://app.biovault.net/web/`; run the provider matrix; then refresh the generated policy/TODO evidence before running the strict completion audit. Track the provider endpoint/evidence handoff in [issue #66](https://github.com/OpenMined/biovault-app/issues/66). See `docs/browser-compat-completion-audit.md` for the prompt-to-evidence checklist.

## 1. Define the Happy Path

- [x] Reuse the existing PGx report browser flow in `.maestro-web/lab-pgx-report-matrix.spec.ts`.
- [x] Start with one small representative sample from `tests/web-report-matrix-samples.yaml`, likely `23andme-v5-hu50B3F5`.
- [x] Treat the compatibility run as passing only when:
  - [x] Lab loads.
  - [x] Example/demo genome is imported.
  - [x] WASM report run completes.
  - [x] Required artifacts exist: `observations.tsv`, `analysis.jsonl`, `reports.jsonl`, `index.html`.
  - [x] Report iframe renders expected text.
  - [x] Console/page errors do not include `Run failed`, `unreachable`, or WASM runtime errors.

## 2. Add a Focused Compatibility Spec

- [x] Add a narrow spec, for example `.maestro-web/lab-wasm-compat.spec.ts`.
- [x] Keep it smaller than the full report matrix so it can run repeatedly across browsers and versions.
- [x] Reuse helper logic from the existing report-matrix test instead of copying large blocks.
- [x] Add environment controls:
  - [x] `WEB_COMPAT_SAMPLE_ID`
  - [x] `WEB_COMPAT_BROWSER`
  - [x] `WEB_COMPAT_RESULT_TIMEOUT_MS`
  - [x] `WEB_COMPAT_STRICT_ARTIFACTS=1`

## 3. Expand Desktop Browser Coverage

- [x] Update `.maestro-web/playwright.config.ts` to support additional compatibility projects:
  - [x] Chromium desktop.
  - [x] Firefox desktop.
  - [x] WebKit desktop.
  - [x] Chromium mobile emulation.
  - [x] Firefox mobile viewport emulation if useful.
- [x] Keep the existing `chromium` project as the default smoke path.
- [x] Add a dedicated script, for example `test-web-compat.sh`.
- [x] Ensure setup installs the required Playwright browsers:
  - [x] `npx playwright install chromium firefox webkit`
- [x] Run compatibility tests with:
  - [x] localhost default for local Linux runs.
  - [x] `WEB_SECURE_ORIGIN=1` / `PW_IGNORE_HTTPS_ERRORS=1` override for CI or provider runs that need an HTTPS shell.

## 4. Record a Browser/Version Result Matrix

- [x] Write each run to a machine-readable file, for example `test-output/browser-compat/results.json`.
- [x] Capture:
  - [x] Browser name.
  - [x] Browser version.
  - [x] Engine.
  - [x] OS.
  - [x] Device profile.
  - [x] Secure context status.
  - [x] WASM support probe result.
  - [x] Worker support probe result.
  - [x] IndexedDB support.
  - [x] File API support.
  - [x] Report run status.
  - [x] Artifact validation status.
  - [x] Failure message and relevant console/page errors.
  - [x] Evidence source, so remote provider rows cannot be satisfied by local-only runs.
- [x] Generate a Markdown summary table for humans.
- [x] Add a result-coverage gate so policy checks only trust complete local smoke results.
- [x] Let remote/historical jobs require target-specific result rows before policy updates.
- [x] Add a browser-compat infrastructure preflight for Android tools, provider endpoints, and historical binaries.

## 5. Add Runtime Capability Probes

- [x] Add a small web runtime compatibility probe in the app or test harness.
- [x] Prefer capability checks over user-agent sniffing.
- [x] Probe required features:
  - [x] `WebAssembly`
  - [x] `Worker`
  - [x] Module worker support, if required by the runtime.
  - [x] `Blob`
  - [x] `File`
  - [x] `FileReader`
  - [x] `FileReaderSync` inside workers, if required.
  - [x] `fetch`
  - [x] `ReadableStream`
  - [x] `indexedDB`
  - [x] `localStorage`
  - [x] Secure context.
  - [x] `crypto.subtle`, if required.
- [x] Save probe output as part of the compatibility result.

## 6. Determine Minimum Browser Requirements

- [x] First test latest stable desktop engines on Linux:
  - [x] Chrome/Chromium.
  - [x] Firefox.
  - [x] WebKit.
- [x] Then test older browser versions using one of:
  - [x] BrowserStack, Sauce Labs, LambdaTest, or similar.
  - [x] Docker/browser images where practical.
  - [x] Playwright pinned browser revisions where sufficient.
- [x] Add `npm run install:browser-compat-history` so pinned historical Chromium caches are reproducible.
- [x] Binary-search browser versions until each browser has a clear minimum passing version.
- [x] Record minimum known-good versions and known failing versions.
- [x] Preserve existing browser-family policy when a targeted historical run only produces partial family coverage.

## 7. Android Mobile Browser Testing

- [x] Keep native Android Maestro tests separate from web-browser compatibility.
- [x] Add Android web browser testing through either:
  - [x] BrowserStack/Sauce/LambdaTest for real Android browser/version coverage.
  - [x] Local Android emulator/device plus Playwright Android for a smaller local smoke path.
- [x] Add `npm run test:web-compat:android-local` and an optional manual CI job for the emulator smoke path.
- [x] Install or attach a local Android toolchain before using the emulator path:
  - [x] `adb`
  - [x] `emulator`
  - [x] `ANDROID_HOME` or `ANDROID_SDK_ROOT`
- [ ] Test at minimum:
  - [ ] Chrome on Android latest.
  - [ ] Chrome on Android one or two older major versions.
  - [ ] Firefox Android latest.
  - [ ] Samsung Internet latest.
- [x] Reuse the same happy-path compatibility spec and result schema.

## 8. iOS Mobile Browser Testing, Deferred

- [x] Defer true iOS browser compatibility until desktop and Android coverage are in place.
- [x] Use BrowserStack/Sauce/LambdaTest or a macOS runner later, since this repo is currently being worked from Linux.
- [x] Track iOS browser shells separately, even though iOS Chrome and Firefox use WebKit.
- [ ] Test at minimum:
  - [ ] Safari latest.
  - [ ] Safari on the oldest iOS version we intend to support.
  - [ ] Chrome iOS latest.
  - [ ] Firefox iOS latest.

## 9. Bake Requirements Into the UI

- [x] Add a central compatibility policy module, for example:
  - [x] `browserSupport.ts`
  - `modules/expo-bioscript/src/webRuntimeSupport.ts` remains an optional future location if runtime ownership moves.
- [x] Store:
  - [x] Minimum known-good browser versions.
  - [x] Required runtime capabilities.
  - [x] Optional degraded features.
- [x] UI behavior:
  - [x] Hard block only if required WASM/runtime features are missing.
  - [x] Warn if browser/version is below the known-good minimum.
  - [x] Explain which capability failed.
  - [x] Avoid blocking solely on user agent when capability checks pass.

## 10. CI Integration

- [x] Keep PR CI lightweight:
  - [x] Latest Chromium happy path only.
- [x] Add scheduled or manual compatibility workflow:
  - [x] Desktop Chromium/Firefox/WebKit.
  - [x] Android provider matrix.
  - [x] iOS provider matrix later.
- [x] Upload artifacts:
  - [x] Playwright traces.
  - [x] Screenshots.
  - [x] Console logs.
  - [x] `results.json`.
  - [x] Markdown compatibility summary.

## Initial Browser Matrix

| Platform | Browser | Where |
| --- | --- | --- |
| Linux desktop | Chromium latest | Playwright local/CI |
| Linux desktop | Firefox latest | Playwright local/CI |
| Linux desktop | WebKit latest | Playwright local/CI |
| Android | Chrome latest | Playwright-compatible provider |
| Android | Firefox latest | Playwright-compatible provider |
| Android | Samsung Internet latest | Playwright-compatible provider |
| iOS | Safari | Playwright-compatible provider or macOS runner |
| iOS | Chrome iOS | Playwright-compatible provider or macOS runner |
| iOS | Firefox iOS | Playwright-compatible provider or macOS runner |

## Current Verified Results

Latest local compatibility evidence is in `test-output/browser-compat/results.json` and `test-output/browser-compat/results.md`.

| Platform/Profile | Browser | Version | Status |
| --- | --- | --- | --- |
| Linux desktop | WebKit/Safari engine | 26.4 | Pass |
| Linux desktop historical | WebKit/Safari engine | 17.4 | Pass via Playwright Docker image |
| Linux desktop historical | WebKit/Safari engine | 15.4 | Fail: PGx-1 package action never became available |
| Linux desktop | Chromium | 148 | Pass |
| Linux desktop | Firefox | 150 | Pass |
| Linux desktop historical | Firefox cached | 127 | Pass via isolated Playwright 1.45 runner |
| Linux desktop historical | Firefox Docker image | 99 | Fail: genome import flow timed out under Playwright 1.22/Firefox 99 |
| Mobile emulation | Chromium | 148 | Pass |
| Mobile emulation | Firefox | 150 | Pass |
| Android local emulator | Chrome | 133 | Pass via Playwright Android |
| Linux desktop historical | Chromium system | 147 | Pass |
| Linux desktop historical | Chromium cached | 141 | Pass |
| Linux desktop historical | Chromium cached | 127 | Pass |
| Linux desktop historical | Chromium cached | 115 | Pass |
| Linux desktop historical | Chromium cached | 105 | Pass |
| Linux desktop historical | Chromium cached | 102 | Pass |
| Linux desktop historical | Chromium cached | 98 | Pass |
| Linux desktop historical | Chromium cached | 97 | Pass |
| Linux desktop historical | Chromium cached | 96 | Fail on latest rerun: genome import flow timed out |
| Linux desktop historical | Chromium cached | 94 | Fail: report package never became runnable |

Current generated UI policy in `lib/browser-support.generated.ts`:

| Browser family | Minimum known-good | Latest known-good | Known failing |
| --- | --- | --- | --- |
| Chrome/Chromium | 97 | 148 | 94, 96 |
| Firefox | 127 | 150 | 99 |
| Safari/WebKit | 17 | 26 | 15 |
| Samsung Internet | None | None | None |
| Chrome iOS | None | None | None |
| Firefox iOS | None | None | None |

Attempted but not usable as compatibility evidence:

| Platform/Profile | Browser | Version | Outcome |
| --- | --- | --- | --- |
| Linux desktop historical | Chromium cached | 95 | No local Playwright package in the checked 1.14.x/1.15.x range provided a Chromium 95 binary; use a provider endpoint if exact Chrome 95 coverage is needed. |

## Implementation Direction

Extract the current report-matrix happy path into a small compatibility spec, run it across browser projects/providers, record browser versions plus capability probes, then turn the observed minimum passing versions into UI warnings.

## Remaining Blockers

- Android local Chrome 133 now passes on the API 36 Pixel 7 AVD created by `ANDROID_BROWSER_COMPAT_CREATE_AVD=1 npm run install:android-browser-compat-sdk`; this is emulator Chrome coverage, not proof of current Chrome latest.
- Reuse `ANDROID_BROWSER_COMPAT_AVD=biovault-web-compat-api36 npm run test:web-compat:android-local` for a standalone local Android Chrome verification on this host; add `WEB_COMPAT_APPEND_RESULTS=1` when appending the Android row to an existing desktop/version matrix. The scripts auto-detect the default `/home/linux/Android/Sdk` install, and explicit `ANDROID_SDK_ROOT`/`ANDROID_HOME` still override it.
- The local Android runner records Android device/package facts and can launch an explicitly installed Chromium-compatible browser package with `WEB_COMPAT_ANDROID_BROWSER_PKG` or `WEB_COMPAT_ANDROID_BROWSER_APK`; Samsung Internet can use real installed package evidence for local smoke coverage, while Firefox Android still requires provider/device automation because Playwright's local Android launcher cannot produce Gecko evidence.
- Validate local Android package/target mapping without a device via `WEB_COMPAT_ANDROID_DRY_RUN=1 WEB_COMPAT_ANDROID_BROWSER=samsung-internet npm run test:web-compat:android-local`; CI covers this with `npm run test:android-browser-compat-config`.
- Android real-browser matrix needs `WEB_COMPAT_REMOTE_ENDPOINTS_JSON`/`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` entries, a `WEB_COMPAT_REMOTE_ENDPOINTS_FILE`/`BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE` file, or a repo-root `browser-compat-endpoints.json` file for `android-chrome-latest`, `android-chrome-previous`, `android-firefox-latest`, and `android-samsung-internet-latest`; use `tests/browser-compat-remote-endpoints.example.json` as the secret/template shape.
- Repository/provider endpoint readiness can be checked with `npm run check:browser-compat-provider-secret`; full remote-run readiness can be checked with `WEB_URL=https://app.biovault.net/web/ WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1 WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1 WEB_COMPAT_REQUIRE_REMOTE_IOS=1 WEB_COMPAT_INCLUDE_DEFERRED=1 npm run check:browser-compat-infra`. Both must pass locally or in CI before full remote Android/iOS provider evidence can be recorded.
- Provider endpoint JSON must cover the target set being run: all required Android targets by default, the explicit `WEB_COMPAT_REMOTE_TARGETS` selection when provided, and the deferred iOS targets only when `WEB_COMPAT_INCLUDE_DEFERRED=1` is set. A `default` endpoint can satisfy every selected target, but unknown or misspelled target ids are rejected, and endpoint/header placeholders such as `${BROWSER_PROVIDER_TOKEN}` must resolve before the provider-secret preflight passes.
- iOS remains intentionally deferred from Linux. Provider/macOS coverage needs endpoints for `ios-safari-latest`, `ios-safari-oldest-supported`, `ios-chrome-latest`, and `ios-firefox-latest`; these are also represented in `tests/browser-compat-remote-endpoints.example.json`.
- Real-device provider execution is documented in `docs/browser-compat-provider-runs.md`, including Android/iOS commands, result validation, artifact merging, and CI inputs.
- Before dispatching provider CI, check that the selected GitHub workflow ref contains these local browser-compat workflow inputs with `WEB_COMPAT_PROVIDER_REF="$COMPAT_REF" npm run check:browser-compat-provider-workflow`; use a pushed feature branch before merge or `main` after the workflow changes are merged.
- The provider runbook includes BrowserStack and LambdaTest endpoint templates; Sauce Labs' current Playwright path is useful only where the configured session truly exposes the requested browser/device and passes the complete provider evidence checks.
- Raw BrowserStack or LambdaTest capability JSON can be rendered into endpoint JSON with `GITHUB_SHA="$(git rev-parse HEAD)" npm run --silent render:browser-compat-endpoints -- <browserstack|lambdatest> path/to/capabilities.json`; use `--silent` when redirecting JSON to a file for `WEB_COMPAT_REMOTE_ENDPOINTS_FILE` or for the `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` secret. The checked-in `tests/browser-compat-provider-capabilities.example.json` template also needs provider credential placeholders such as `BROWSERSTACK_USERNAME`/`BROWSERSTACK_ACCESS_KEY` or `LT_USERNAME`/`LT_ACCESS_KEY`, and is validated by `npm run check:browser-compat-matrix`.
- Provider convenience scripts are available: `npm run test:web-compat:remote-android`, `npm run test:web-compat:remote-ios`, `npm run test:web-compat:remote-all`, `npm run check:browser-compat-android-provider`, and `npm run check:browser-compat-ios-provider`.
- Real provider runs and remote-provider infrastructure preflight reject missing or local-only `WEB_URL` values such as `localhost` before opening a provider session; set `WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1` only when a provider tunnel intentionally maps that local host for remote devices.
- Provider result checks validate required target ids, remote target metadata, result browser names, provider device/OS versions, version labels, user-agent evidence, run metadata, capability probes, artifact/report status, and relevant console/page errors against the local Android, historical browser, and remote-provider manifests, so misspelled targets, mislabeled versions, weak rows, or mislabeled desktop/provider sessions cannot satisfy Android, iOS, Firefox, Safari, or Samsung Internet rows.
- Required Android/iOS target rows must be marked as `remote-provider` evidence; local Android package evidence cannot complete provider-only TODO rows or update provider-backed UI policy families.
- `npm run update:browser-compat-todo` only checks Android/iOS rows after matching `remote-provider` evidence against the remote target metadata, result browser name, provider device/OS versions, user-agent, run metadata, capability probe, artifact/report, and relevant console/page requirements, so the checklist cannot be completed by target id alone.
- Samsung Internet, Chrome iOS, and Firefox iOS are separate UI policy families; their minimum/latest values remain `None` until their real provider rows exist, and the UI warns rather than claiming full support for browser families with no known-good evidence.
- Remote endpoint parsing and target selection can be checked without opening browsers via `WEB_COMPAT_REMOTE_DRY_RUN=1 WEB_COMPAT_REMOTE_ENDPOINTS_FILE=tests/browser-compat-remote-endpoints.example.json npm run test:web-compat:remote-matrix`; add `WEB_COMPAT_INCLUDE_DEFERRED=1` to include iOS rows in that dry run.
- Real remote matrix runs reject missing or empty endpoint placeholders and non-`wss://` endpoints before launching provider sessions; dry runs still allow unresolved placeholders for template validation.
- `npm run check:browser-compat-infra` reports invalid remote endpoint shape and provider-unreachable `WEB_URL` values too, and `WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1` or `WEB_COMPAT_REQUIRE_REMOTE_IOS=1` makes those endpoint or URL problems fail preflight. Set `WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1` to make the preflight perform an HTTP reachability check for the configured `WEB_URL`.
- `WEB_COMPAT_REMOTE_TARGETS` scopes that provider-endpoint preflight to selected target ids for single-target provider reruns.
- Separate local, historical, Android, and provider result artifacts can be written with per-run `WEB_COMPAT_OUTPUT_DIR` values and combined before policy/completion checks with `npm run merge:browser-compat-results -- <results-or-runs-path>...`; set `WEB_COMPAT_MERGE_OUTPUT_DIR` to write somewhere other than `test-output/browser-compat`. Target-scoped rows are deduplicated by `remoteTargetId`, keeping the newest rerun for each target.
- Result validators and policy generation accept `WEB_COMPAT_RESULTS_FILE=/path/to/results.json`, and policy/TODO commands accept `WEB_COMPAT_POLICY_FILE` plus `WEB_COMPAT_TODO_FILE`; this lets merged artifacts be checked against copied files before replacing local evidence.
- After merged evidence is in place, run `npm run update:browser-support` and `npm run update:browser-compat-todo` so the generated UI policy table and evidence-backed Android/iOS checklist rows are synchronized before the strict audit.
- The strict audit now fails if real provider evidence exists but the generated UI policy still has `None` for the corresponding browser family, so support-policy generation must happen before TODO completion.
- Browser support assessment behavior is covered by `npm run test:browser-support` and is run in PR/static CI plus the compatibility CI path.
- The implemented browser-compat static checks can be rerun together with `npm run test:browser-compat-static`; this excludes real provider execution and the strict completion audit, which still require Android/iOS provider evidence.
- The manual CI input `compat_completion=true` downloads `web-compat*-artifacts`, merges browser compatibility results, refreshes the generated browser support policy and TODO evidence rows, validates browser-compat docs/script references and the generated browser support policy, runs the strict completion audit, and uploads the merged results plus refreshed `lib/browser-support.generated.ts` and `TODO.md`.
- Full TODO completion can be audited with `npm run check:browser-compat-completion`; the evidence contract is `tests/browser-compat-completion.yaml`, including required generated UI policy families, and the audit is expected to fail until real Android provider rows and iOS provider/macOS rows exist in `test-output/browser-compat/results.json`.
- `npm run check:browser-compat-matrix` also validates that `tests/browser-compat-completion.yaml` only references known remote targets, supported browser families, and an existing TODO file.
- Exact Chrome 95 coverage is not available from the checked local Playwright package set; use a provider endpoint if the UI policy needs to distinguish Chrome 95 from the known-good 97 and known-failing 94/96 boundary.
