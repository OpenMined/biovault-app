# BioVault Architecture

## Goal

One project, multiple platforms, minimal duplication. Each platform gets a UI shell that feels native to it; the state, protocol, and compute logic are shared.

**Invariant:** all file-format, assay, and variant-lookup logic lives in the
`bioscript` Rust crates. Every platform consumes bioscript through a binding
appropriate to that platform — see
[`architecture/bioscript-is-source-of-truth.md`](architecture/bioscript-is-source-of-truth.md).
No TS/JS reimplementations of bioscript functionality are permitted.

## Supported platforms

| Platform | Shell | UI primitives | Transport to state bus | Status |
|---|---|---|---|---|
| iOS | Expo (React Native 0.83) | `react-native` | In-process via Expo native module (`expo-bioscript`, `expo-monty`) | Existing |
| Android | Expo (React Native 0.83) | `react-native` | In-process via Expo native module | Existing |
| Web (Expo) | Expo web export | `react-native-web` | WebSocket → local Rust server, or remote | Existing |
| Desktop (macOS/Windows/Linux) | Tauri 2 | React DOM | WebSocket → embedded Rust server in the Tauri binary | Scaffolded |
| Headless agent / CLI / tests | none — any WS client | n/a | WebSocket | Scaffolded |

Browsers, Playwright tests, and AI agents are all first-class clients of the same protocol — not a special-case addition.

## State model

State lives in Rust. The UI is a projection of that state. Every mutation is a serializable `Command`; every state change is broadcast as an `Event`. The same message flow drives the Tauri window, a Playwright test, and an agent.

```
              ┌───────────── Rust (authoritative) ─────────────┐
              │   AppState (RwLock)                             │
              │   Command handlers (bioscript, monty, …)        │
              │   Event broadcaster (tokio::sync::broadcast)    │
              └───────────────┬────────────────────────────────┘
                              │  ws://127.0.0.1:17890/ws
         ┌────────────────────┼───────────────────┬───────────────┐
         ▼                    ▼                   ▼               ▼
   Tauri UI (React)     Expo UI (RN+RNW)     Playwright tests   AI agent
```

On mobile the WebSocket is optional: the native module and React code run in the same process, so the transport is a direct in-process function call with the same `Command`/`Event` shape.

## Shared packages

```
packages/
  protocol/           # @biovault/protocol
    src/
      types.ts        # AppState, Command, ServerMsg — mirror of protocol.rs
      transport.ts    # Transport interface
      transports/
        ws.ts         # WebSocket transport (desktop, browser tests, agents)
        memory.ts     # In-process transport (mobile; later wired to native module)
      store.ts        # createStore(transport) → { useAppState, send }
```

Contract: every platform builds the UI against `useAppState()` + `send(command)`. Transports are swapped at the edges.

Planned (not yet in repo):

```
packages/
  ui-core/            # @biovault/ui-core
    tokens.ts         # colors, spacing, typography
    theme.ts
    widgets/
      Button.tsx           # RN primitives → iOS / Android / Expo web
      Button.desktop.tsx   # DOM override for native desktop feel
      Text.tsx
      Card.tsx
    icons/            # SVG sources
```

- Metro (Expo) auto-resolves `.ios.tsx`, `.android.tsx`, `.native.tsx`, `.web.tsx`, falling back to `.tsx`.
- Vite (Tauri) uses an alias + custom resolver to prefer `.desktop.tsx` over the base file.
- Tokens and theme are platform-agnostic TypeScript — imported identically everywhere.

## Per-platform shells

Each platform owns its navigation, screens, and platform-specific interactions. They share widgets and state, not screens.

```
apps/
  mobile/             # the existing Expo app (currently at repo root)
    app/              # Expo Router screens — stack nav, gestures, haptics
    components/       # mobile-only compositions
  desktop/            # Tauri — currently at ./desktop/
    src/
      navigation/     # menu bar, command palette, multi-pane layouts
      screens/        # desktop-wide layouts
    src-tauri/        # Rust shell + WS server
```

Mobile and desktop are free to diverge where platform conventions demand it. They converge on:

- `@biovault/protocol` for state and commands
- `@biovault/ui-core` for tokens, atomic widgets, icons
- Rust crates in `bioscript/` and `bioscript/monty/` for compute

## Rust backend

Two existing Rust workspaces stay authoritative for compute:

- **`bioscript/rust/`** — 6 crates (`bioscript-core`, `bioscript-runtime`, `bioscript-formats`, `bioscript-schema`, `bioscript-cli`, `bioscript-ffi`). FFI crate exposes C-ABI (iOS `.xcframework`) and JNI (Android).
- **`bioscript/monty/`** — Python interpreter; `monty-js` exposes NAPI bindings, `monty-python` exposes PyO3.

Tauri reuses these directly by path dependency — no FFI layer needed because desktop Rust and backend Rust are the same binary. Mobile keeps the existing FFI/JNI/NAPI bridges.

Shell layers:

```
desktop/src-tauri/src/
  protocol.rs    # Command / Event / AppState — mirror of packages/protocol/src/types.ts
  state.rs       # Store<RwLock<AppState> + broadcast<ServerMsg>>
  server.rs      # axum WebSocket server, token auth, fan-out to clients
  main.rs        # boots tokio runtime + server, then Tauri window
```

Mobile wraps the same crates via `modules/expo-bioscript` and `modules/expo-monty`. The Expo native module becomes the `MemoryTransport` reducer on mobile.

## Testing strategy

Three surfaces of the same product, three test layers that share the command protocol:

1. **UI smoke** (`.maestro-desktop/smoke.spec.ts`, `.maestro/smoke.yaml`, `.maestro-web/smoke.spec.ts`) — exercises the UI shell per platform. Proves the screen renders and clicks produce the expected state.
2. **Protocol** (`.maestro-desktop/rpc.spec.ts`) — drives the app via WebSocket without any UI. Proves Rust state transitions are correct independent of React.
3. **Rust unit** — in each crate under `bioscript/rust/*/tests`. Proves compute logic.

Agent or CLI automation reuses layer 2 — it's the same contract.

## Transport selection

| Consumer | Transport | Why |
|---|---|---|
| Tauri webview | `WsTransport` → `ws://127.0.0.1:17890` | Rust server lives in the same binary; localhost only. |
| Expo iOS/Android | `MemoryTransport` (later wired to native module) | Avoids running a local server on mobile; Rust is already in-process via FFI. |
| Expo web | `WsTransport` → configurable URL | Needs a Rust server somewhere — local dev server or deployed backend. |
| Playwright (desktop) | `WsTransport` | Same endpoint the app uses; no simulator needed. |
| AI agent / CLI | `WsTransport` | Any language that can open a WebSocket is a client. |

## Security

Current state (dev):

- WebSocket binds to `127.0.0.1` only.
- Hardcoded token `biovault-dev-token` required on connect (query string `?token=…`).

Before shipping:

- Rotate token at startup; write to a file readable only by the current user. Tauri reads it from disk; external clients must read that file first.
- Consider a capability model per command (e.g., `RunAssay` requires prior `AcceptTerms`).

## Evolution roadmap

Short term:

1. [done] Extract `packages/protocol`, consume it from desktop.
2. [done] Extract `packages/ui-core` (tokens ported from `styles/brand.ts`; desktop widgets), wire desktop to it.
3. Add `.ios.tsx` / `.android.tsx` / `.web.tsx` widget variants and migrate Expo screens to `@biovault/ui-core`.
4. Move `AppState` in Rust to depend on real bioscript commands (e.g., `ParseVcf`, `RunAssay`).
5. Codegen `packages/protocol/src/types.ts` from Rust via `ts-rs` so they can't drift.

Medium term:

5. Expo app refactored to use `createStore(memoryTransport)` so mobile and desktop share screens' state access.
6. Switch Expo native modules to emit the same `Command`/`Event` shapes instead of bespoke APIs.
7. Introduce a hosted mode: Rust server behind an auth-gated WS endpoint for web + remote agents.

Long term:

8. Split `apps/mobile` and `apps/desktop` under workspaces once we confirm Expo plays well with the monorepo layout.
9. `@biovault/ui-core` widget set feature-complete; platform shells become thin.

## Directory layout (current)

```
/
├── app/                          # Expo Router screens (mobile + Expo web)
├── components/                   # RN components for the Expo app
├── bioscript/
│   ├── rust/                     # bioscript crates (core, runtime, ffi, …)
│   └── monty/                    # monty crates (NAPI, PyO3)
├── modules/                      # Expo native modules wrapping Rust for iOS/Android
│   ├── expo-bioscript/
│   ├── expo-biovault/
│   └── expo-monty/
├── desktop/                      # Tauri shell
│   ├── src/                      # React DOM UI (Vite)
│   └── src-tauri/                # Rust: protocol, state, WS server, window
├── packages/
│   ├── protocol/                 # @biovault/protocol (shared state bus)
│   └── ui-core/                  # @biovault/ui-core (tokens + widgets)
├── docs/
│   └── architecture.md           # this file
├── .maestro/                     # iOS + Android Maestro flows
├── .maestro-web/                 # Playwright flows for Expo web
├── .maestro-desktop/             # Playwright flows for Tauri (UI + RPC)
├── test-ios.sh
├── test-android.sh
├── test-web.sh
└── test-desktop.sh
```
