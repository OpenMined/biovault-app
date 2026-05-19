# Real-device web-compat tests (iOS Safari / Android Chrome)

These verify the **actual mobile browser runtime** runs the BioVault web
app's WASM pipeline end-to-end — not Playwright's `mobile-*` projects,
which only put a phone UA/viewport on desktop WebKit/Chromium and do
**not** exercise real iOS Safari or real Android Chrome.

Each test loads the app from a local dev server, dismisses onboarding,
opens `/lab`, clicks the demo run button, waits for the real PGx report
to finish (Monty + bioscript-wasm processing the bundled demo genome),
clicks **View result**, and verifies the 4 artifacts
(`observations.tsv`, `analysis.jsonl`, `reports.jsonl`, `index.html`).

This is distinct from [`docs/ios-android-testing.md`](./ios-android-testing.md),
which covers the **native React Native app** (Maestro/XCUITest). This doc
is the **web app inside real mobile browsers**.

## Architecture

Both drivers use Appium (raw W3C WebDriver over `fetch`, no webdriverio):

| Platform | Driver | Real runtime |
| --- | --- | --- |
| iOS | `appium-xcuitest-driver` (+ WebDriverAgent) | Mobile Safari / WebKit on the iOS Simulator |
| Android | `appium-uiautomator2-driver` (+ chromedriver) | Chrome on a real Android emulator/device |

Appium drives the **visible browser UI**, so runs are watchable in a
windowed simulator/emulator (unlike Playwright `_android`'s CDP tab).

- iOS: `scripts/run-local-ios-browser-compat.mjs`
- Android: `scripts/run-local-android-browser-compat-demo.mjs`
- Entry point: `./test-web-compat.sh --ios` / `./test-web-compat.sh --android`

## Prerequisites

```bash
npm i -g appium
appium driver install xcuitest@8       # Appium 2.x compatible (8.x)
appium driver install uiautomator2@3   # Appium 2.x compatible (3.x)
```

- **iOS**: Xcode + at least one iOS Simulator runtime.
- **Android**: Android SDK + a **booted** emulator/device (`adb devices`).
  chromedriver is auto-downloaded to match the device's Chrome.
- An Expo web server, or pass `WEB_URL`.

## Running

```bash
# real Mobile Safari (auto-picks stable iOS 18.3, pre-boots the sim itself)
./test-web-compat.sh --ios

# real Android Chrome (uses the attached emulator; reuses WEB_URL if given)
WEB_URL=http://localhost:8082 ANDROID_SERIAL=emulator-5554 ./test-web-compat.sh --android
```

Results: `test-output/browser-compat/runs/*.json`
(`compatibilitySource`: `ios-sim-appium` / `android-emu-appium`).

### Environment knobs

| Var | Default | Notes |
| --- | --- | --- |
| `WEB_URL` | starts own Expo on `:8082` | point at any server; use `localhost` (secure context, no certs) |
| `WEB_COMPAT_IOS_VERSION` | `18.3` | installed runtime to target |
| `WEB_COMPAT_IOS_DEVICE` | `iPhone 16` | simulator device |
| `WEB_COMPAT_IOS_UDID` | — | attach to a specific pre-booted sim |
| `ANDROID_SERIAL` | first `adb` device | target emulator/device |
| `ANDROID_AVD` | first `emulator -list-avds` | AVD to launch if no device attached |
| `ANDROID_WC_HEADLESS` | unset (**headed**) | `1` = launch the AVD with `-no-window` |
| `ANDROID_WC_KILL_EMULATOR` | unset (left running) | `1` = shut a self-launched emulator on exit |
| `APPIUM_PORT` | `4723` | change to run iOS+Android in parallel |
| `WEB_COMPAT_RESULT_TIMEOUT_MS` | `600000` | report-completion poll budget |

`./test-web-compat.sh --android` is **headed by default**: if no device
is attached it launches an AVD *with a window* so you can watch real
Chrome run the demo. If a device is already attached (a pre-booted
emulator, or CI's `android-emulator-runner`), it attaches to that and
launches nothing. CI sets `ANDROID_WC_HEADLESS` implicitly via the
runner action booting its own headless emulator first.

## Hard-won gotchas

- **Don't let Appium cold-create a just-released iOS major** (e.g. 26.x):
  it reliably half-boot-hangs. The iOS script defaults to **iOS 18.3** and
  finds/creates + fully boots the sim itself before Appium attaches.
- **First iOS run builds WebDriverAgent** (xcodebuild, several minutes);
  subsequent runs reuse it.
- **Use `localhost`, not `10.0.2.2` or a fake domain.** `localhost` is a
  secure context over plain HTTP with no certs (iOS Sim shares the host
  network; Android uses `adb reverse tcp:PORT`). A non-`localhost` host
  needs HTTPS + a CA trusted in the sim/emulator. See
  [`docs/architecture/wasm.md`](./architecture/wasm.md) for the
  COOP/COEP / `SharedArrayBuffer` nuance (single-threaded WASM works
  without isolation; Monty's Phase 1b multithread needs COOP/COEP).
- **Headless emulator is invisible but functional.** AVDs launched with
  `-no-window` work fine; relaunch the same AVD without `-no-window` to
  watch it (Chrome first-run state persists in the AVD profile).
- **iOS and Android can't run simultaneously** by default — both bind
  Appium on `:4723`. Run one at a time, or set `APPIUM_PORT`.
- These runs are **slow** (emulator/sim + dev-server bundle + WASM under
  software rendering). A physical device or the minified production build
  is far faster; this combo is worst-case but proves the real runtime.

## Verified status

- **iOS** — ✅ PASSED on **real Mobile Safari, iOS 18.3 (iPhone 16)**:
  app loaded (`secureContext: true`), demo genome processed through real
  Monty + bioscript-wasm, all 4 artifacts produced and shown in the
  result view. Repeatable via `./test-web-compat.sh --ios` (zero env).
- **Android** — ✅ PASSED on **real Chrome 148, Android 16 / API 36
  (`sdk_gphone64_arm64` emulator)** via Appium/UiAutomator2:
  `secureContext: true`, demo genome processed through real Monty +
  bioscript-wasm, all 4 artifacts produced and shown in the result view.
  Repeatable via `./test-web-compat.sh --android`.

Both report `sharedArrayBuffer: false` / `crossOriginIsolated: false`
(expected — the dev server doesn't surface COOP/COEP; single-threaded
WASM path, consistent with the architecture note).

## CI

Wired in `.github/workflows/ci.yml`, triggered on **PR to main** +
weekly schedule + `workflow_dispatch` (`compat_local_smoke`):

- **`web-compat-ios`** — `namespace-profile-mac-medium` (mirrors the
  native `ios` job's macOS/Xcode/Simulator setup): `npm i -g appium` +
  `appium driver install xcuitest@8`, then `./test-web-compat.sh --ios`.
- **`web-compat-android`** — `namespace-profile-linux-medium` + KVM
  (mirrors the native `android` job): `appium driver install
  uiautomator2@3`, then `reactivecircus/android-emulator-runner@v2`
  (API 36, `pixel_7`) running `./test-web-compat.sh --android`.
- The paid remote-provider path is **removed**: the remote wrapper,
  provider endpoint renderer, provider preflight, related npm scripts,
  and workflow dispatch inputs are deleted. No third-party paid services
  — only our own runners.
