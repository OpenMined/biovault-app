# iOS + Android smoke testing — what works, what breaks, and why

A running log of everything I learned getting `./test-ios.sh`,
`./test-android.sh`, and their CI counterparts stable on PR #32. Scope:
this repo's mobile smoke tests only — web/rust/lint notes only where they
intersect.

## TL;DR matrix

| Job | Runner | Why that runner |
|---|---|---|
| rust | `ubuntu-latest` | Cheap + fast for a small Tauri workspace |
| lint | `ubuntu-latest` | tsc + eslint; no special hardware needed |
| web | `ubuntu-latest` | Playwright + Expo web; commodity |
| ios | `namespace-profile-mac-medium` | Tahoe 26.3 / Xcode 26.3 — matches local dev |
| android | `ubuntu-latest` | Only supported host for `reactivecircus/android-emulator-runner` + Google's emulator binary (see §Android) |

## Local wall-clock (warm caches)

| Test | Original | After fixes |
|---|---|---|
| `./test-ios.sh` | ~10 min | 2:01 |
| `./test-android.sh` | ~10 min | 1:40 |

## Shared infrastructure

### Submodules
All `actions/checkout@v4` steps use:
```yaml
with:
  submodules: recursive
  token: ${{ secrets.GITHUB_TOKEN }}
```
`bioscript` and `biovault-data` are the submodules — without them web-smoke
fails resolving `../bioscript/assay_result_schema.json`, the rust job can't
find `bioscript/rust`, and ios/android can't build the native bioscript lib.

### Maestro install
`scripts/install-maestro.sh` hits the GitHub API for the latest release.
Unauthenticated requests are rate-limited on shared CI runners → 403.

- Pass `GITHUB_TOKEN` as an env on every `npm install` step.
- Script branches on `${GITHUB_TOKEN:-}` instead of expanding an array
  (bash 3 on macOS doesn't tolerate empty array expansion under `set -u`).

### Metro for smoke tests
Both `test-ios.sh` and `test-android.sh` launch Metro with:
```
npx expo start --dev-client --no-dev --minify
```
Expo's docs recommend this for perf: skips dev-only invariants / warnings
and minifies the bundle. Shaved ~27s off iOS locally (2:28 → 2:01).

### Dropped artificial waits
Both scripts used to `sleep 8` before invoking Maestro. Maestro's first
`extendedWaitUntil` already polls with a 60s timeout, so the sleep was pure
overhead. Dropped.

## The Expo dev menu / launcher — mute it, don't script around it

Fresh installs of an Expo dev-client app show two different sheets:

1. **Expo Dev Launcher**: "DEVELOPMENT SERVERS" list with the Metro URL.
2. **Dev menu onboarding**: "This is the developer menu…" sheet (iOS) or a
   "Reload / Go home / Tools" overlay (Android).

`.maestro/smoke.yaml` tolerates both, but the robust approach is to
pre-set the preference so the onboarding sheet never shows:

### iOS

In `test-ios.sh`, after `expo run:ios`:
```bash
xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES
xcrun simctl spawn "$UDID" defaults write host.exp.Exponent EXDevMenuIsOnboardingFinished -bool YES
```

### Android

Shared prefs equivalent. From
`node_modules/expo-dev-menu/android/src/.../DevMenuPreferences.kt`:
- File: `expo.modules.devmenu.sharedpreferences`
- Keys: `isOnboardingFinished`, `showsAtLaunch`

`test-android.sh` pushes a prepared XML via `adb run-as`:
```bash
adb push $TMP /data/local/tmp/devmenu_prefs.xml
adb shell "run-as $PACKAGE mkdir -p shared_prefs"
adb shell "run-as $PACKAGE cp /data/local/tmp/devmenu_prefs.xml shared_prefs/expo.modules.devmenu.sharedpreferences.xml"
adb shell am force-stop $PACKAGE
```
`force-stop` forces the prefs to be re-read on next launch.

### smoke.yaml fallback flow

If the sheets somehow still appear, the Maestro flow has run-flow blocks
that dismiss them. Stages:
1. launcher list → tap the `http://…:8081` row (URL is unique to the
   server cell; "BioVault Dev" label matches the app title too, so avoid it)
2. dev-menu onboarding → tap "Continue"
3. "Go home" overlay (Android) → `pressKey: Back`
4. app onboarding ("I understand") → tap + Continue
5. home → accept either "Explore Assays" or "Your genomic files" as the
   landing assert (post-onboarding screen has changed before)

## iOS specifics

### Xcode version / iOS platform SDK
RN 0.83 requires Xcode ≥ 16.1. **But** pinning a specific Xcode by name
bit us: on GitHub's `macos-15` runner image, Xcode 16.1 ships with iOS 18.1
SDK but not the matching 18.1 *platform package*, so xcodebuild fails with:

> iOS 18.1 is not installed. To use with Xcode, first download and install
> the platform.

The same happened when pinning 16.2 (reported 18.5 platform installed but
the SDK was 18.2). Lesson: **use the runner's default Xcode** when it's
≥ 16.1 — it's the only combination where SDK and platform reliably match.
Current `Select Xcode` step:
```bash
DEFAULT_VER=$(xcodebuild -version | awk '/^Xcode/{print $2}')
MIN="16.1"
if [ "$(printf '%s\n%s\n' "$MIN" "$DEFAULT_VER" | sort -V | head -1)" = "$MIN" ]; then
  echo "Using runner default ($DEFAULT_VER)."
else
  # fallback: try named Xcodes
  ...
fi
```

### Pick a simulator that matches the installed iOS platform

The CI step iterates `xcrun simctl list runtimes` (available only) and
picks a runtime the runner actually has, then finds an iPhone on it.
Passes the UDID as `IOS_SIMULATOR_UDID` env var; `test-ios.sh` honours it
and skips the name-based lookup (which would re-pick across *all* runtimes).

### Rust iOS targets
`expo-bioscript/scripts/build-rust-ios.sh` installs all three, and the
cocoapods build path triggers it — so we install them all in CI even
though only the sim target is strictly needed for the smoke flow:
```
aarch64-apple-ios, x86_64-apple-ios, aarch64-apple-ios-sim
```
Trimming broke pod install with `Missing Rust target: aarch64-apple-ios`.

### iOS speedups applied

- Skip `open -a Simulator` when `$CI` is set (saves ~5–10s of GUI launch).
- Warm `pod install` (no `--repo-update`) before `expo run:ios` so expo
  skips its own pod install when Manifest.lock ≡ Podfile.lock. Saves
  ~30–60s of cocoapods specs refresh.
- DerivedData cache key drops `Cargo.lock` — Rust changes no longer blow
  the 6–8min Xcode cache.
- `namespace-profile-mac-medium` (Tahoe 26.3 + Xcode 26.3) as the runner.
  Matches local dev (Xcode 26.x); no platform mismatch.

### Known iOS gotchas

- **expo-modules-core + Xcode 16.4**: on Namespace's older mac image we
  saw `unknown attribute 'MainActor'` building expo-modules-core. Xcode
  16.2 and 26.3 both work; 16.4 was the outlier.
- **`ios/Pods` stale state**: if a previous run died mid-build, xcodeproj
  post-install hook can fail with `Consistency issue: no parent for
  object 'index.swift'`. Fix: `rm -rf ios` and let `expo prebuild`
  regenerate.
- **Simulator data migration**: 2+ min on first boot of a fresh sim image
  on CI. Unavoidable per runner.

## Android specifics

### Host must be x86_64 Linux

Tried `namespace-profile-linux-arm64-medium` — doesn't work:
- Container has no `/dev/kvm` and no `udev`, so the standard KVM-enable
  udev rule fails (we gate that step now: no-op on arm64 containers).
- Namespace's bare arm64 image has no Android SDK pre-installed.
- `android-actions/setup-android@v3` tries to install `emulator` — but
  Google's emulator host binary is **x86_64-only on Linux** (no aarch64
  Linux build). sdkmanager errors with "Dependant package with key
  emulator not found".
- `reactivecircus/android-emulator-runner`'s own README says the action
  only supports Linux and macOS (x86_64) VMs. `arm64-v8a` is a guest
  image option, capped to ~API 30.

Bottom line: Android stays on `ubuntu-latest` with `x86_64` guest arch.
GitHub's ubuntu-latest has the SDK + KVM + cmdline-tools pre-wired.

### Android speedups applied

- Trim the Rust cross-compile targets — all four are required because
  `expo-bioscript`'s `buildRustAndroid` task installs them all:
  ```
  aarch64-linux-android, armv7-linux-androideabi,
  x86_64-linux-android, i686-linux-android
  ```
  (Same lesson as iOS: don't over-trim.)
- `cargo install cargo-ndk --locked` before the gradle build (not
  pre-installed on ubuntu-latest).
- AVD cache, Gradle cache, prebuilt `android/` cache.
- Drop `sleep 8`; use `--no-dev --minify` on Metro.
- Dropped the `matrix: api-level: [36]` strategy — the job name used to
  be `android (36)`, now it's just `android`. API level lives in
  `env.ANDROID_API_LEVEL`.

## Simulator / emulator dev-menu setup recap

| Platform | File | Keys set to skip |
|---|---|---|
| iOS | `NSUserDefaults` for bundle | `EXDevMenuIsOnboardingFinished=YES` |
| Android | `shared_prefs/expo.modules.devmenu.sharedpreferences.xml` | `isOnboardingFinished=true`, `showsAtLaunch=false` |

## Helpful commands

```bash
# Cancel a stale CI run (saves minutes):
gh run cancel <run-id> --repo OpenMined/biovault-app

# Watch live:
gh pr checks 32 --repo OpenMined/biovault-app --watch

# Per-job status + timing:
gh run view <run-id> --repo OpenMined/biovault-app \
  --json jobs -q '.jobs[] | {name, status, conclusion}'

# Reset local iOS state after onboarding runs:
xcrun simctl uninstall booted org.openmined.biovault.dev

# Regenerate ios/ from scratch if cocoapods gets stuck:
rm -rf ios && ./test-ios.sh
```

## Things that wasted time (don't re-try)

- Pinning `Xcode_16.1`/`16.2` on macos-15 → platform SDK mismatch.
- `runs-on: namespace-profile-linux-arm64-medium` for android → no Linux
  aarch64 emulator binary exists.
- Trimming iOS / Android Rust targets — expo-bioscript scripts assume all
  archs are installed, even if only one is built.
- Adding `sleep` to wait for the app; Maestro's `extendedWaitUntil` does
  this correctly.
- `--repo-update` on pod install every run — expo-cli doesn't need it if
  Pods are warm.

## Open items

- iOS full cold-cache run on Namespace mac still takes several minutes;
  sim data migration (~2min) is the unavoidable floor.
- CI doesn't auto-trigger on some pushes (GitHub coalescing behaviour?).
  Fallback is `gh workflow run CI --ref <branch>`.
