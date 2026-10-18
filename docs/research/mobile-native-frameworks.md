# Native mobile frameworks: Lynx vs React Native (with Expo) vs fully native

Researched 2026-10-16 from the Lynx docs (lynxjs.org, including `llms-full.txt`), GitHub repos and the npm registry. Nothing was run on a device. "Not documented" is not the same as "missing".

## Outcome
Owner chose **React Native with Expo** for iOS and Android. Lynx stays a possible revisit.

## Maturity (October 2026)
- Lynx engine: about 15k stars, Apache-2.0, releases 4.0.3 and 4.1.0 in September 2026, in production inside TikTok. ReactLynx is still 0.x (0.127). About 1,270 open issues.
- Sparkling (app layer for standalone Lynx apps): 2.1.0 release candidates, about 245 stars. A Callstack review found early tooling (no live-reload loop, broken `doctor`, iOS template quirks); the team called it very early.
- React Native 0.88 (about 127k stars) and Expo SDK 58, updated the week of the research.

## What the Lynx docs say is missing or different
- JS runtime: JavaScriptCore on the iOS background thread, PrimJS on Android; ES2015 level, transpiled.
- `Intl` is not implemented (use formatjs polyfills). `TextEncoder`/`TextDecoder` missing (a UTF-8 helper exists). WebSocket not documented for apps (fetch and server-sent events are).
- WebAssembly: Android only, background thread only, partial API; not on iOS.
- No official SQLite, libsodium, OCR, push or contacts modules. Native modules are simple to write (TypeScript interface, Swift/Kotlin class, Autolink) but each is ours to build and maintain on two platforms.
- Text input needs an extra package and does not avoid the keyboard. `lynx-ui` has sheet, dialog, list, swipe action; no date picker. `<svg>` exists for charts. Accessibility is basic.
- A third-party ecosystem (`sigx-lynx`) offers SQLite, biometrics, secure storage and WebSocket modules, but it is a separate framework from a small team (about 4 stars, 3 contributors, created May 2026).

## React Native with Expo
Available and recently updated on npm: `expo-sqlite`, `expo-notifications`, `expo-local-authentication`, `expo-contacts`, `expo-camera`, `expo-secure-store`, `react-native-libsodium`, `react-native-quick-crypto`, Skia and Victory for charts, Reanimated, Bottom Sheet.

Weak spots: the ML Kit OCR wrapper (`@react-native-ml-kit/text-recognition`, last release Sept 2025) and no first-class Apple Vision module. Hermes `Intl` support was not verified.

The mobile UI is a separate codebase from the TanStack Start web UI (no DOM, Tailwind or Ark UI); domain, storage, sync and crypto logic can be shared in TypeScript.

## Why not Lynx now
A local-first finance app needs storage, crypto and sync to be proven and boring. On Lynx we would write about ten native modules on two platforms (SQLite, libsodium, Argon2id, OCR, push, biometrics, contacts, camera and files, share and deep links, date picker) before building screens. Revisit when Sparkling is stable and SQLite and crypto modules exist.
