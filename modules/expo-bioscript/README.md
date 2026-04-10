# expo-bioscript

Expo local Expo module wrapper for the BioScript runtime.

## Current

This module lives inside `biovault-app` and builds against the app's local `bioscript` checkout.

Right now:
- `src/` contains the JS API surface
- `ios/` and `android/` contain the Expo native module bridge
- `../../bioscript/` is the source of the Rust runtime used for native builds
- the first implemented API is `runFile(...)`

The current goal is to expose a narrow Expo-native interface to BioScript without exposing generic Monty execution directly.

## Build Source

By default this local module builds against:
- `../../bioscript`

You can override that during development with:

```sh
export BIOSCRIPT_ROOT=/absolute/path/to/bioscript
```

## Current Wrapper Status

- `runFile(...)` is implemented end-to-end through the Rust FFI layer
- Android native packaging builds successfully
- iOS native packaging builds successfully
- Apple mobile targets currently disable HTS-backed CRAM/BAM indexing and lookup paths

## First API

The first Expo-facing API is `runFile(...)`.

```ts
type RunFileRequest = {
  scriptPath: string;
  root?: string;
  inputFile?: string;
  outputFile?: string;
  participantId?: string;
  traceReportPath?: string;
  timingReportPath?: string;
  inputFormat?: 'auto' | 'text' | 'zip' | 'vcf' | 'cram';
  inputIndex?: string;
  referenceFile?: string;
  referenceIndex?: string;
  autoIndex?: boolean;
  cacheDir?: string;
  maxDurationMs?: number;
  maxMemoryBytes?: number;
  maxAllocations?: number;
  maxRecursionDepth?: number;
};

type RunFileResult = {
  ok: true;
};
```

For the first implementation, errors are surfaced as native/module exceptions rather than encoded into the success payload.

## Long-Term

If the API stabilizes, this will likely evolve into a cleaner split:
- `bioscript-core`
- `bioscript-ffi`
- `expo-bioscript`

At that point this local module can be replaced by a cleaner published dependency boundary if needed.
