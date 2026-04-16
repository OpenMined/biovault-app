# iOS + Android smoke testing — current state, what works, what breaks, and why

A running log of everything learned stabilising `./test-ios.sh`,
`./test-android.sh`, and their CI counterparts. Scope: this repo's mobile
smoke tests only. Web/rust/lint notes are mentioned only where they intersect.

## TL;DR matrix

| Job | Runner | Current state | Why that runner |
|---|---|---|---|
| rust | `ubuntu-latest` | working | Cheap + fast for a small Tauri workspace |
| lint | `ubuntu-latest` | working | tsc + eslint; no special hardware needed |
| web | `ubuntu-latest` | flaky / failing independently | Playwright + Expo web; commodity |
| ios | `namespace-profile-mac-medium` | not green yet | Matches local Xcode 26.x better than GitHub macOS images |
| android | `namespace-profile-linux-medium` | working | x86_64 Linux with KVM works with `reactivecircus/android-emulator-runner` |

## Latest verified CI status

From run `24496995024` on April 16, 2026:

- `android` on `namespace-profile-linux-medium`: passed
- `ios` on `namespace-profile-mac-medium`: failed
- `web`: failed, but unrelated to the mobile runner work

## Current local / CI script state

### Shared infrastructure

- All `actions/checkout@v4` steps use:

```yaml
with:
  submodules: recursive
  token: ${{ secrets.GITHUB_TOKEN }}
```

- `bioscript` and `biovault-data` are required submodules. Without them:
  - web-smoke fails resolving `../bioscript/assay_result_schema.json`
  - rust jobs can't find `bioscript/rust`
  - iOS / Android can't build the native bioscript lib

- `scripts/install-maestro.sh` hits the GitHub API for the latest release.
  Unauthenticated CI requests get rate-limited, so every `npm install` step
  must pass `GITHUB_TOKEN`.

### Metro for smoke tests

Both `test-ios.sh` and `test-android.sh` launch Metro with:

```bash
npx expo start --dev-client --no-dev --minify
```

That remains the right tradeoff for smoke tests:
- skips dev-only invariants / warnings
- minifies the bundle
- removes unnecessary startup overhead

### Expo dev-menu / launcher

Fresh installs of an Expo dev-client app can show either:

1. Expo Dev Launcher: "DEVELOPMENT SERVERS" list with the Metro URL
2. Dev menu onboarding sheet / overlay

`.maestro/smoke.yaml` still contains fallback dismiss flows, but the robust
approach is still to pre-seed prefs so the onboarding UI never appears.

#### iOS

`test-ios.sh` writes:

```bash
xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES
xcrun simctl spawn "$UDID" defaults write host.exp.Exponent EXDevMenuIsOnboardingFinished -bool YES
```

#### Android

`test-android.sh` writes
`shared_prefs/expo.modules.devmenu.sharedpreferences.xml` via `adb run-as`
with:

- `isOnboardingFinished=true`
- `showsAtLaunch=false`

and then force-stops the app so prefs are re-read on next launch.

## iOS specifics

### Xcode version / iOS platform SDK

RN 0.83 requires Xcode `>= 16.1`. Pinning named Xcode versions on GitHub's
`macos-15` image caused SDK/platform mismatches, so the workflow now prefers
the runner's default Xcode when it already satisfies the minimum version.

That logic is still correct.

### Simulator selection

The workflow enumerates installed runtimes and picks an available iPhone on a
runtime that actually exists on the runner, then passes the UDID via
`IOS_SIMULATOR_UDID`. `test-ios.sh` honours that and skips name-based lookup.

That also remains correct.

### Rust iOS targets

All three iOS Rust targets are still required:

```text
aarch64-apple-ios
x86_64-apple-ios
aarch64-apple-ios-sim
```

Trimming these still breaks pod install / native builds because the
`expo-bioscript` scripts assume all of them exist.

### iOS speedups and stability fixes already applied

- Skip `open -a Simulator` when `$CI` is set.
- Warm `pod install` without `--repo-update` before the build.
- Keep `DerivedData` cached independently of `Cargo.lock`.
- Pass the selected simulator UDID into the script.
- Keep Metro on `--no-dev --minify`.
- Drop artificial `sleep` delays before Maestro.

### New iOS CI work after the original notes

The original failure mode on Namespace mac was:

- Expo built successfully
- Expo then tried to activate / talk to `Simulator.app` via AppleScript
- CI failed in `osascript` / `System Events`

That was not an app build failure. It was a headless-CI launch failure.

To avoid that, `test-ios.sh` now has a CI-only path that:

1. uses `xcodebuild`
2. installs the built `.app` with `xcrun simctl install`
3. launches it with `xcrun simctl launch`

instead of relying on Expo's GUI-oriented simulator activation path.

### Current iOS blocker

After switching to the headless path, the old AppleScript problem went away.
The current failure is simpler:

```text
xcodebuild: error: 'ios/BioVaultDev.xcworkspace' does not exist.
```

This means:

- the new headless `xcodebuild + simctl` approach is the right direction
- the remaining failure is path resolution inside `test-ios.sh`
- it is not currently blocked on Xcode version, simulator availability, or
  Expo's AppleScript path anymore

### Known iOS gotchas

- **expo-modules-core + Xcode 16.4**: older Namespace mac images showed
  `unknown attribute 'MainActor'`; Xcode 16.2 and 26.x worked better.
- **`ios/Pods` stale state**: a broken prior run can leave Xcode project state
  inconsistent. `rm -rf ios` and regenerating via Expo still fixes that.
- **Simulator data migration**: first boot on a fresh runner still costs
  a couple of minutes and is unavoidable.

## Android specifics

### What definitively works now

Android no longer needs GitHub `ubuntu-latest` for this repo. The verified
working path is:

- runner: `namespace-profile-linux-medium`
- emulator host arch: `x86_64`
- action: `reactivecircus/android-emulator-runner@v2`

This passed in CI on April 16, 2026.

### Why Namespace Linux works but Namespace mac didn't

#### Working path

`namespace-profile-linux-medium` passed all of:

- KVM setup
- Android SDK / Java / Rust setup
- AVD snapshot creation
- full Android smoke test run

#### Failed experiment: Namespace mac

`namespace-profile-mac-medium` was tried for Android and failed during AVD
snapshot creation. The log repeatedly showed:

```text
adb: device 'emulator-5554' not found
The process 'undefined/platform-tools/adb' failed with exit code 1
Timeout waiting for emulator to boot.
```

So the Android mac path was dropped. It is not worth keeping in the workflow.

#### Failed experiment: Namespace Linux arm64

`namespace-profile-linux-arm64-medium` was also a dead end:

- no useful `/dev/kvm` / `udev` path for the expected setup
- Android SDK not preinstalled
- Google's Linux emulator host binary is x86_64-only

### Android speedups and stability fixes applied

- Keep all four Android Rust targets installed:

```text
aarch64-linux-android
armv7-linux-androideabi
x86_64-linux-android
i686-linux-android
```

- Install `cargo-ndk --locked` before Gradle.
- Cache Gradle state.
- Cache generated `android/`.
- Cache the AVD snapshot.
- Keep Metro on `--no-dev --minify`.
- Drop hardcoded sleep delays before Maestro.
- Use `pixel_7` consistently for both the profile and cache key.
- Make `test-android.sh` find the Android SDK on either Linux or macOS via
  `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `$HOME/Android/Sdk`, or
  `$HOME/Library/Android/sdk`.

## Timing breakdowns worth remembering

From CI run `24496464188`:

### Android

- Total job time: about `11m31s`
- `Run Android tests`: about `8m47s`
- `Create AVD snapshot`: about `1m17s`
- `Install npm dependencies`: about `23s`

### iOS

- Total job time before failure: about `9m05s`
- `Run iOS tests`: about `7m27s`
- `Boot iOS simulator`: about `29s`
- `Install npm dependencies`: about `24s`

Interpretation:

- Most of the mobile time is still inside the monolithic test steps, not the
  top-level setup steps.
- If we want meaningful further optimisation, the scripts should emit
  sub-timings for:
  - Metro startup
  - native build
  - install
  - launch
  - Maestro

## Simulator / emulator dev-menu setup recap

| Platform | File | Keys set to skip |
|---|---|---|
| iOS | `NSUserDefaults` for bundle | `EXDevMenuIsOnboardingFinished=YES` |
| Android | `shared_prefs/expo.modules.devmenu.sharedpreferences.xml` | `isOnboardingFinished=true`, `showsAtLaunch=false` |

## Helpful commands

```bash
# Cancel a stale CI run:
gh run cancel <run-id> --repo OpenMined/biovault-app

# Watch live:
gh pr checks 32 --repo OpenMined/biovault-app --watch

# Per-job status + timing:
gh run view <run-id> --repo OpenMined/biovault-app \
  --json jobs -q '.jobs[] | {name, status, conclusion}'

# Reset local iOS simulator app state:
xcrun simctl uninstall booted org.openmined.biovault.dev

# Regenerate ios/ if CocoaPods / Xcode project state gets wedged:
rm -rf ios && ./test-ios.sh
```

## Things that wasted time (don't re-try)

- Pinning named Xcode versions on GitHub macOS images when the runner default
  already satisfies the minimum version.
- `namespace-profile-linux-arm64-medium` for Android.
- `namespace-profile-mac-medium` for Android.
- Trimming iOS / Android Rust target lists.
- Adding arbitrary `sleep` before Maestro.
- Running `pod install --repo-update` every time.

## Open items

- Fix the `xcodebuild` workspace path in the CI-only iOS build path.
- Once iOS is green, add sub-phase timing output to both test scripts so we
  can see where the remaining 7-9 minutes actually go.
- Web is failing independently and should be treated as separate work.
