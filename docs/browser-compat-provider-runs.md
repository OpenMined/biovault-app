# Browser Compatibility Provider Runs

This runbook covers the remaining real-device browser compatibility rows in
`TODO.md`. Local desktop, historical, and Android-emulator smoke coverage is
handled by the scripts in `package.json`; these rows require a Playwright-capable
browser provider, device cloud, or macOS/iOS runner.

The local Android runner uses Playwright's Android Chromium/DevTools launcher.
It records Android device/package facts for the emulator/device row and can
launch explicitly installed Chromium-compatible packages such as Samsung
Internet. Firefox Android still requires provider/device automation because the
local launcher cannot produce Gecko/Firefox evidence.

## Evidence Contract

The strict completion gate is:

```sh
npm run check:browser-compat-completion
```

It reads `tests/browser-compat-completion.yaml` and expects passing result rows
for every target listed there. See
`docs/browser-compat-completion-audit.md` for the full prompt-to-artifact
evidence checklist.

The current required provider targets are:

- `android-chrome-latest`
- `android-chrome-previous`
- `android-firefox-latest`
- `android-samsung-internet-latest`
- `ios-safari-latest`
- `ios-safari-oldest-supported`
- `ios-chrome-latest`
- `ios-firefox-latest`

Each target must run the same WASM demo/report happy path used by the local
compatibility spec.
Provider result validation checks complete run metadata, source tagging,
target metadata, result `browserName`, version label, provider device name,
provider OS version, user-agent, runtime capability probe output,
artifact/report pass status, `artifactNames`, and relevant console/page errors
against the remote matrix.
`results.md` is validated alongside `results.json` so the human summary row
count cannot drift from the machine-readable evidence.
A row labeled
`android-samsung-internet-latest`, for example, must report Android plus the
`latest` version label, the configured Samsung Galaxy S24 / Android 14 target,
a Samsung Internet user agent, complete capability evidence, and no `Run
failed`, `unreachable`, or WASM runtime errors; a desktop Chrome session with
the same target id, or a row whose `browserName` still says `chromium` instead
of Samsung Internet, will be rejected.
`WEB_COMPAT_REQUIRED_TARGETS` values are also checked against the local Android,
historical browser, and remote provider manifests, so misspelled target ids fail
validation.
Required Android/iOS target rows must also be recorded with
`compatibilitySource: "remote-provider"`. Local Android package runs are useful
for emulator/device smoke coverage, but they cannot complete the provider-only
rows or update provider-backed browser family policy.
The strict completion audit also requires passing provider evidence to be
reflected in `lib/browser-support.generated.ts`, so run
`npm run update:browser-support` before `npm run update:browser-compat-todo`.
Result validation defaults to the compatibility sample
`23andme-v5-hu50B3F5` and the artifacts `observations.tsv`,
`analysis.jsonl`, `reports.jsonl`, and `index.html`. For copied or staged
evidence, `WEB_COMPAT_REQUIRED_SAMPLE_ID`, `WEB_COMPAT_REQUIRED_ARTIFACTS`,
`WEB_COMPAT_RESULTS_MD_FILE`, and `WEB_COMPAT_REQUIRE_RESULTS_MD` can override
the required sample, required artifact list, Markdown summary path, and
Markdown-summary requirement.

## Endpoint Secret

Use `tests/browser-compat-remote-endpoints.example.json` as the shape for the
`WEB_COMPAT_REMOTE_ENDPOINTS_JSON` value or the
`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` CI secret/env alias.
For local runs, a gitignored repo-root `browser-compat-endpoints.json` is
auto-detected. `WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json`
or `BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json` can
also be used when the file lives elsewhere or you want to be explicit.
The endpoint JSON must be a top-level object keyed by remote target id, with an
optional `default` entry for shared provider endpoints.

Each entry can be either a WebSocket endpoint string:

```json
{
	"android-chrome-latest": "wss://provider.example/playwright?target=android-chrome-latest"
}
```

or an object with headers:

```json
{
	"android-chrome-latest": {
		"wsEndpoint": "wss://provider.example/playwright?target=android-chrome-latest",
		"headers": {
			"Authorization": "Bearer ${BROWSER_PROVIDER_TOKEN}"
		}
	}
}
```

Environment placeholders such as `${BROWSER_PROVIDER_TOKEN}` are expanded by
`scripts/run-remote-browser-compat-matrix.mjs` before connecting.
Capability-render placeholders must resolve to non-empty environment values
unless `WEB_COMPAT_ENDPOINT_ALLOW_PLACEHOLDERS=1` is set for a template-only
render.
Real remote matrix runs also reject missing or empty endpoint placeholders and
endpoint values that do not start with `wss://`; dry runs allow unresolved
placeholders so the checked-in example shape can be validated without secrets.
`npm run check:browser-compat-infra` reports the same endpoint problems, and
`WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1` or `WEB_COMPAT_REQUIRE_REMOTE_IOS=1`
makes invalid provider endpoints and missing or local-only `WEB_URL` values fail
the preflight.
When `WEB_COMPAT_REMOTE_TARGETS` is set, the preflight only requires endpoints
for the selected target ids.

Configure a repository secret after rendering real provider endpoints:

```sh
gh secret set BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON \
	--repo OpenMined/biovault-app \
	< browser-compat-endpoints.json
```

Validate the configured secret before dispatching provider CI:

```sh
npm run check:browser-compat-provider-secret
```

The preflight checks repository-level secrets on `OpenMined/biovault-app` by
default, or `GITHUB_REPOSITORY` when set. For forks or one-off validation
against another repository, set `WEB_COMPAT_PROVIDER_REPOSITORY=owner/repo`.
An organization-level secret named `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` can
also satisfy CI when it is visible to this repository; local `gh secret list
--repo` validation may not be able to inspect org-level secrets without
additional permissions, but the workflow still receives them through
`${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}`.
If that endpoint JSON secret is absent, the manual `web-compat-remote` CI job
also tries to render a gitignored endpoint file from provider credential
secrets before the provider-secret preflight. It prefers
`BROWSERSTACK_USERNAME` plus `BROWSERSTACK_ACCESS_KEY`, and falls back to
`LT_USERNAME` plus `LT_ACCESS_KEY`, using
`tests/browser-compat-provider-capabilities.example.json` and
`npm run --silent render:browser-compat-endpoints -- <provider> ...`. The
result is written to `WEB_COMPAT_REMOTE_ENDPOINTS_FILE` inside the runner temp
directory, so the existing preflight, infra check, and matrix runner validate
the same endpoint contract without requiring a committed or artifacted secret
file.

When endpoint JSON is supplied through `WEB_COMPAT_REMOTE_ENDPOINTS_JSON`,
`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON`, `WEB_COMPAT_REMOTE_ENDPOINTS_FILE`,
`BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE`, a repo-root
`browser-compat-endpoints.json`, or the CI secret, this check validates the same
target set the remote run would use. By default it requires all Android provider
targets;
`WEB_COMPAT_REMOTE_TARGETS` narrows the required endpoints to specific target
ids, and `WEB_COMPAT_INCLUDE_DEFERRED=1` adds the deferred iOS targets. A
`default` endpoint can satisfy every selected target, but target ids must still
be spelled exactly as they appear in `tests/browser-compat-remote-matrix.yaml`.
Endpoint placeholders such as `${BROWSER_PROVIDER_TOKEN}` must resolve to
non-empty environment values before this preflight passes.

For local one-off runs, export the same JSON as an environment variable instead
of writing a repository secret:

```sh
export WEB_COMPAT_REMOTE_ENDPOINTS_JSON="$(cat browser-compat-endpoints.json)"
```

Or point the compatibility scripts at the JSON file directly:

```sh
export WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json
```

`BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` and
`BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE` are accepted aliases for CI or local
shells that use the repository secret name directly.

When the file is named `browser-compat-endpoints.json` and lives at the repo
root, the provider preflight, infrastructure preflight, and remote matrix runner
read it automatically.

## Provider Endpoint Templates

Use BrowserStack as the primary provider path for the required Android/iOS
rows. Its Playwright support matrix documents Android and iOS as compatible
platforms, and its capability docs include `deviceName` for Android devices.
BrowserStack documents Playwright connections through
`wss://cdp.browserstack.com/playwright?caps=...`, where `caps` is URL-encoded
JSON. For this runbook, generate one endpoint per target and put the encoded
capabilities in the matching `wsEndpoint`:

```json
{
	"android-chrome-latest": {
		"wsEndpoint": "wss://cdp.browserstack.com/playwright?caps=${BROWSERSTACK_ANDROID_CHROME_LATEST_CAPS}"
	}
}
```

LambdaTest documents Playwright connections through
`wss://cdp.lambdatest.com/playwright?capabilities=...`, where `capabilities`
is URL-encoded JSON. Use LambdaTest only after confirming that the selected
account/product exposes the requested real mobile browser/device to Playwright;
its public docs have historically separated Playwright cloud support from real
mobile-device automation. The strict result validator will still reject rows
whose platform, browser shell, result `browserName`, version label, user-agent,
capability probe, artifact/report status, or relevant console/page evidence
does not satisfy the target:

```json
{
	"android-firefox-latest": {
		"wsEndpoint": "wss://cdp.lambdatest.com/playwright?capabilities=${LT_ANDROID_FIREFOX_LATEST_CAPS}"
	}
}
```

Use the renderer when you have raw provider capability JSON and want to produce
the endpoint secret value without hand-encoding query parameters:

```sh
GITHUB_SHA="$(git rev-parse HEAD)" \
BROWSERSTACK_USERNAME=... \
BROWSERSTACK_ACCESS_KEY=... \
npm run --silent render:browser-compat-endpoints -- browserstack tests/browser-compat-provider-capabilities.example.json \
	> browser-compat-endpoints.json
```

For LambdaTest, the checked-in template uses `LT_USERNAME` and
`LT_ACCESS_KEY` instead:

```sh
GITHUB_SHA="$(git rev-parse HEAD)" \
LT_USERNAME=... \
LT_ACCESS_KEY=... \
npm run --silent render:browser-compat-endpoints -- lambdatest tests/browser-compat-provider-capabilities.example.json \
	> browser-compat-endpoints.json
```

The common generated filenames `browser-compat-endpoints*.json`,
`browserstack-caps*.json`, `lambdatest-caps*.json`, `sauce-caps*.json`,
`*-browser-compat-caps*.json`, and `*-browser-compat-endpoints*.json` are
gitignored and covered by the TruffleHog exclude guard because they can contain
credentials after placeholder expansion.

The capabilities file may be either provider-keyed:

```json
{
	"browserstack": {
		"android-chrome-latest": {
			"browser": "chrome",
			"browser_version": "latest",
			"deviceName": "Google Pixel 9",
			"osVersion": "15.0",
			"browserstack.username": "${BROWSERSTACK_USERNAME}",
			"browserstack.accessKey": "${BROWSERSTACK_ACCESS_KEY}"
		}
	}
}
```

or use `{ "provider": "browserstack", "targets": { ... } }`. The checked-in
example at `tests/browser-compat-provider-capabilities.example.json` contains
template entries for every remote target; copy it to a gitignored local file
before adding real provider details. The renderer validates target ids against
`tests/browser-compat-remote-matrix.yaml` and requires referenced environment
variables, including `GITHUB_SHA` for provider build labels, to exist unless
`WEB_COMPAT_ENDPOINT_ALLOW_PLACEHOLDERS=1` is set for a template-only render.

Sauce Labs currently documents Playwright remote execution through Selenium
Grid/CDP for Chrome and Edge. That can be useful for desktop Chromium evidence,
but do not use it to satisfy the required Android/iOS rows unless the configured
session really exposes the requested mobile platform and browser shell to
Playwright and passes the user-agent validation.

Provider capabilities should set at least:

- Platform/device for the target, such as Android real device or iOS real
  device/simulator.
- Browser shell for the target, such as Chrome, Firefox, Safari, or Samsung
  Internet.
- Browser version label, such as latest, previous major, or the oldest iOS
  version this app intends to support.
- Provider device name and OS version matching
  `tests/browser-compat-remote-matrix.yaml`.
- Build/name metadata that includes the target id.
- Tunnel/local-testing settings only when `WEB_URL` is not publicly reachable.

## Provider-Reachable URL

Remote browser runs require `WEB_URL` to point at the web app as the provider
browser can see it. The current deployed app URL is
`https://app.biovault.net/web/`. If using a provider local tunnel, use the
tunnel URL when the provider exposes one.

The remote matrix runner and single-target wrapper reject local-only URLs such
as `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, and `*.local` before
opening a provider session. If the provider tunnel intentionally maps that local
host for remote devices, set `WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1` for the run.
The infrastructure preflight performs the same check when remote Android or iOS
targets are required. Add `WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1` to make the
preflight perform an HTTP reachability check for the configured `WEB_URL`.

## Dry Run

Validate target selection and endpoint JSON without starting browsers:

```sh
WEB_COMPAT_REMOTE_DRY_RUN=1 \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=tests/browser-compat-remote-endpoints.example.json \
npm run test:web-compat:remote-matrix
```

Dry runs allow unresolved placeholders, including a full endpoint value such as
`${BROWSER_PROVIDER_WS}`, so templates can be checked before secrets are present.
Real provider runs require those placeholders to resolve before browser launch.

Include iOS rows:

```sh
WEB_COMPAT_REMOTE_DRY_RUN=1 \
WEB_COMPAT_INCLUDE_DEFERRED=1 \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=tests/browser-compat-remote-endpoints.example.json \
npm run test:web-compat:remote-matrix
```

## Android Provider Run

Run all required Android real-browser targets against a deployed URL reachable
from the provider:

```sh
WEB_URL=https://app.biovault.net/web/ \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run test:web-compat:remote-android
```

For a provider tunnel that deliberately maps local app URLs, opt in explicitly:

```sh
WEB_URL=http://localhost:8081 \
WEB_COMPAT_ALLOW_LOCAL_WEB_URL=1 \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run test:web-compat:remote-android
```

Run one Android target:

```sh
WEB_URL=https://app.biovault.net/web/ \
WEB_COMPAT_REMOTE_TARGETS=android-firefox-latest \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run test:web-compat:remote-matrix
```

Validate the Android provider result:

```sh
WEB_COMPAT_REQUIRED_PROJECTS= \
WEB_COMPAT_REQUIRED_TARGETS=android-chrome-latest,android-chrome-previous,android-firefox-latest,android-samsung-internet-latest \
npm run check:browser-compat-android-provider
```

## Android Local Package Run

The local Android runner can launch an installed Chromium-compatible browser
package with Playwright's Android `pkg` option. This is useful for a real
attached device or an emulator that already has the target browser installed:

```sh
WEB_COMPAT_ANDROID_BROWSER=samsung-internet \
WEB_COMPAT_ANDROID_BROWSER_PKG=com.sec.android.app.sbrowser \
WEB_COMPAT_ANDROID_TARGET_ID=android-samsung-internet-latest \
npm run test:web-compat:android-local
```

Set `WEB_COMPAT_APPEND_RESULTS=1` when adding the Android-local row to an
existing desktop or historical compatibility matrix. Without append mode, the
runner writes a standalone Android-local result set.

For APK-based runs, set `WEB_COMPAT_ANDROID_BROWSER_APK=/path/to/browser.apk`.
The result still has to pass the normal target metadata and user-agent checks,
so renamed Chrome evidence cannot satisfy Samsung Internet rows. Firefox
Android remains provider-only for this Playwright path.

Validate the local package/target mapping without touching `adb` or a device:

```sh
WEB_COMPAT_ANDROID_DRY_RUN=1 \
WEB_COMPAT_ANDROID_BROWSER=samsung-internet \
npm run test:web-compat:android-local
```

The dry run also rejects browser/target mismatches, for example a Chrome package
claiming the Samsung Internet target.

## iOS Provider Run

iOS is deferred from Linux local development. Run iOS through a provider or a
macOS-hosted Playwright-compatible grid:

```sh
WEB_URL=https://app.biovault.net/web/ \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run test:web-compat:remote-ios
```

Validate the iOS provider result:

```sh
WEB_COMPAT_REQUIRED_PROJECTS= \
WEB_COMPAT_REQUIRED_TARGETS=ios-safari-latest,ios-safari-oldest-supported,ios-chrome-latest,ios-firefox-latest \
npm run check:browser-compat-ios-provider
```

## Full Local Provider Sequence

When `browser-compat-endpoints.json` contains all Android and iOS endpoint
entries and `WEB_URL` is reachable by the provider, run the required provider
rows and refresh the local evidence with:

```sh
WEB_COMPAT_INCLUDE_DEFERRED=1 \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run check:browser-compat-provider-secret

WEB_URL=https://app.biovault.net/web/ \
WEB_COMPAT_CHECK_WEB_URL_REACHABLE=1 \
WEB_COMPAT_REQUIRE_REMOTE_ANDROID=1 \
WEB_COMPAT_REQUIRE_REMOTE_IOS=1 \
WEB_COMPAT_INCLUDE_DEFERRED=1 \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run check:browser-compat-infra

WEB_URL=https://app.biovault.net/web/ \
WEB_COMPAT_REMOTE_ENDPOINTS_FILE=browser-compat-endpoints.json \
npm run test:web-compat:remote-all

npm run check:browser-compat-results
npm run update:browser-support
npm run update:browser-compat-todo
npm run check:browser-support
npm run check:browser-compat-completion
```

If local, historical, Android-local, Android-provider, and iOS-provider results
are produced in separate directories, merge them first as described below, then
run the update and audit commands against the merged matrix.

## Merge Evidence

When local, historical, Android, and iOS results are produced as separate
artifacts, merge them before updating policy or running the completion audit:

```sh
npm run merge:browser-compat-results -- \
	path/to/local/test-output/browser-compat \
	path/to/historical/test-output/browser-compat \
	path/to/android/test-output/browser-compat \
	path/to/ios/test-output/browser-compat
```

The merge step fails if the supplied artifact paths contain no browser
compatibility result rows; this catches empty or wrong artifact downloads before
policy generation can run against an empty matrix. Rows with a
`remoteTargetId` are deduplicated by target id, so a rerun for
`android-chrome-latest` replaces the older row for that target even when the
provider browser version changes.

Validate and audit the merged evidence:

```sh
npm run check:browser-compat-results
npm run update:browser-support
npm run update:browser-compat-todo
npm run check:browser-support
npm run check:browser-compat-completion
```

Use `WEB_COMPAT_RESULTS_FILE=/path/to/results.json` to validate a merged file
without replacing `test-output/browser-compat/results.json`. Policy and TODO
commands also accept `WEB_COMPAT_POLICY_FILE` and `WEB_COMPAT_TODO_FILE` for
dry runs against copied files.
Set `WEB_COMPAT_OUTPUT_DIR=/path/to/browser-compat` on local, historical,
Android-local, or remote-provider runs when you want each evidence source to
write into a separate directory before merging.

## CI

Manual CI inputs:

- `compat_local_smoke=true` runs the latest desktop and mobile-emulation smoke.
- `compat_versions=true` runs historical desktop targets.
- `compat_android_local=true` runs the local Android emulator smoke.
- `compat_web_url=https://app.biovault.net/web/` plus
  `BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON` runs provider targets.
- `compat_include_ios=true` includes the deferred iOS provider targets in the
  remote compatibility run and requires those result rows during validation.
- `compat_remote_dry_run=true` validates endpoint secret visibility, target
  selection, and provider-reachable `WEB_URL` without fetching fixtures,
  opening provider browser sessions, deploying the web app, or producing
  compatibility evidence.
- `compat_completion=true` downloads `web-compat*-artifacts`, merges them,
  refreshes `lib/browser-support.generated.ts` and `TODO.md`, checks
  browser-compat docs/script references, runs the strict completion audit, and
  uploads those refreshed files with the merged results.

Run `compat_completion=true` after producing the local smoke, historical,
Android-local, Android-provider, and iOS-provider artifacts for the same app
revision. The completion job uses `if: always()` so it can still audit partial
runs, but partial artifact sets are expected to fail the strict gate.

Before launching a remote-provider CI run, verify the endpoint secret is present
on the repository and that the selected workflow ref contains the browser
compatibility dispatch inputs:

```sh
npm run check:browser-compat-provider-secret
WEB_COMPAT_PROVIDER_REF="$COMPAT_REF" npm run check:browser-compat-provider-workflow
```

If that secret is missing, the remote-provider preflight will report missing
Android/iOS endpoints and the strict completion audit cannot pass.
The current provider endpoint/evidence handoff is tracked in
[#66](https://github.com/OpenMined/biovault-app/issues/66).
The manual remote-provider workflow runs the same check before fixture download
or browser launch. If the workflow ref check fails, push these workflow changes
to the selected branch or merge them to `main` before dispatching provider CI.

After the endpoint secret is present and the browser-compat workflow inputs are
available on the selected branch, validate secret visibility, target selection,
and the provider-reachable URL without opening provider browser sessions with:

```sh
COMPAT_REF=main
gh workflow run CI \
	--repo OpenMined/biovault-app \
	--ref "$COMPAT_REF" \
	-f deploy_ref="$COMPAT_REF" \
	-f compat_web_url=https://app.biovault.net/web/ \
	-f compat_remote_dry_run=true \
	-f compat_include_ios=true
```

Use `COMPAT_REF=main` after these workflow changes are merged; use a pushed
feature branch while validating the compatibility workflow before merge.
When that dry-run reaches the provider-secret and infrastructure checks, launch
the full evidence run against the same app revision:

```sh
COMPAT_REF=main
gh workflow run CI \
	--repo OpenMined/biovault-app \
	--ref "$COMPAT_REF" \
	-f deploy_ref="$COMPAT_REF" \
	-f compat_local_smoke=true \
	-f compat_versions=true \
	-f compat_android_local=true \
	-f compat_web_url=https://app.biovault.net/web/ \
	-f compat_include_ios=true \
	-f compat_completion=true
```

The second command opens real provider browser sessions, uploads local,
historical, Android-local, Android-provider, and iOS-provider artifacts, then
runs the completion job to merge evidence, refresh generated policy/TODO files,
and audit `npm run check:browser-compat-completion`.

If a single target needs to be rerun, add
`-f compat_remote_targets=<target-id>` and keep `compat_include_ios=true` for
deferred iOS target ids.

## Provider References

- BrowserStack Playwright capabilities:
  `https://www.browserstack.com/docs/automate/playwright/playwright-capabilities`
- LambdaTest Playwright CI/CD:
  `https://www.lambdatest.com/support/docs/playwright-tests-in-ci-cd/`
- Sauce Labs Playwright Selenium Grid:
  `https://docs.saucelabs.com/web-apps/automated-testing/playwright/selenium-grid/`
- Playwright `browserType.connect`:
  `https://playwright.dev/docs/api/class-browsertype#browser-type-connect`
