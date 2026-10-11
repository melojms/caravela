# Task 9b: Shaka adapter and HLS mode in the player controller

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-09b (branch `task/09b-shaka`, from `main`).
Background: read docs/HANDOFF.md, docs/PLAN.md ("Playback design" step 3) and README.md ("Shaka Player (not included)") first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@amazon-devices/react-native-w3cmedia` ~2.3.4-rn-83, Shaka Player 4.16.13 with Amazon's Vega patches (r1.2).
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**What's already on `main`** (use it):
- `src/playback/types.ts`: `PlaybackSession` has `mode: 'url' | 'hls'`, `url` (the HLS master playlist for `hls`), `startMs`, optional `maxStreamingBitrate` (bits/s). Don't change this file.
- `src/playback/PlayerController.ts`: URL mode only. Order: `new VideoPlayer()` → `await initialize()` → listeners → `setSurfaceHandle` → `src`. Resume seeks on `loadedmetadata` and plays on `seeked`. `destroy()` pauses, clears the surface, `deinitialize()`s, removes the listeners.
- `src/playback/deviceProfile.ts`: `DEFAULT_MAX_BITRATE`.
- `package.json` already has `@xmldom/xmldom`, `base-64` and `@types/base-64` (the polyfills import them).
- `scripts/setup-shaka.sh` and the gitignored `src/vendor/shaka/`: `dist/shaka-player.compiled{,.debug}.{js,d.ts}` and Amazon's `polyfills/*.ts` (`DocumentPolyfill`, `ElementPolyfill`, `TextDecoderPolyfill`, `W3CMediaPolyfill`, `MiscPolyfill`, `DOMParserPolyfill`; each has a default export with a static `install()`).

**9a runs in parallel**: it changes `resolver.ts` (returns `mode: 'hls'` sessions with the server's `TranscodingUrl` and `maxStreamingBitrate`) and `deviceProfile.ts`. Don't touch those two files. 9c checks both together on the Fire TV afterwards.

## Licence rules (important)
- Amazon's polyfills and their `ShakaPlayer.ts` wrapper are **proprietary**. Never copy them, or code from them, into a committed file. Only `import` the polyfills from `src/vendor/shaka/polyfills/`.
- Amazon's wrapper is at `/home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel/src/shakaplayer/ShakaPlayer.ts` (it doesn't build: its `PlayerBase` isn't shipped). Read it **only to learn which Vega-specific steps** Shaka needs (the polyfill install order, `global.gmedia`, `registerNativePlayerUtils` / `HlsParser.setNativeFunctions`, the http/https scheme and closed-caption parser re-registration, `configure` values, the `load` / `unload` / `destroy` order). Write your own code for the steps we need, using Shaka's public API, and leave out DRM, ads, OOB subtitles and anything else we don't use.
- Shaka's `dist` is Apache-2.0 and can be imported freely.

## Setup
- Run `npm ci` first. The worktree has no `node_modules`.
- The worktree has no `src/vendor/` either: run `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (it only copies files; the build is already done).
- Vega docs (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`): https://developer.amazon.com/docs/vega/latest/media-player-shaka-player.html (sample `App.tsx`: initialize → listeners → `autoplay = false` → Shaka `load` → then the surface and `play()`; on end: Shaka `unload()` → `deinitialize()`), `react_native_for_vega_media_player.md`, `react_native_for_vega_media_troubleshooting.md`, and https://developer.amazon.com/docs/vega/latest/media-player-improve-hls-performance.html. Shaka API: https://shaka-player-demo.appspot.com/docs/api/shaka.Player.html (4.16).

## Scope (only this)
1. **`src/playback/shaka.ts`** (new): a small adapter, the only file that imports `src/vendor/shaka/`.
   - Installs Amazon's polyfills once per app run, in the order their wrapper uses, `MiscPolyfill` included (the Vega doc says the app crashes without it), then `shaka.polyfill.installAll()` and the other one-time Vega steps you found.
   - `createShakaSession(videoPlayer, {maxBandwidth, onError})` (name it as you like) → `{load(url, startSeconds), destroy()}`. It creates `shaka.Player`, attaches it to the `VideoPlayer`, configures it (`abr.restrictions.maxBandwidth` from `session.maxStreamingBitrate ?? DEFAULT_MAX_BITRATE`, plus the settings the Vega wrapper uses that apply to plain HLS VOD), and forwards Shaka `error` events with a readable message (category/code in `__DEV__` logs).
   - Import the release build (`shaka-player.compiled`), not the debug one.
   - Keep `manifest.hls.sequenceMode` off by default, behind a constant: 9c decides on the TV whether TS needs it.
2. **`src/playback/PlayerController.ts`**: HLS mode next to URL mode.
   - `session.mode === 'hls'`: after `initialize()` and the listeners, `autoplay = false`, create the Shaka session and `load(session.url, session.startMs / 1000)` **before** the surface is set (Vega doc order). Start playback once both the load has resolved and the surface is set.
   - Resume: Shaka's start time replaces the `loadedmetadata` seek in HLS mode (so the server doesn't start transcoding at 0). The reporter's `start()` still waits for the first `playing`.
   - `destroy()` in HLS mode: Shaka `unload()`/`destroy()` first (awaited, failures logged), then the existing pause → clear surface → `deinitialize()` → remove listeners. Also when `destroy()` comes while `load()` is still pending.
   - A Shaka error or a rejected `load()` → `fail(message)` like a `MediaError` (the screen already shows Retry).
   - URL mode must behave exactly as before.
3. **Jest**: tests must run on a clean checkout **without `src/vendor/`**. Add `test/__mocks__/shaka.ts` (a fake `shaka.Player` with `attach` / `configure` / `load` / `unload` / `destroy` / events, and a `polyfill.installAll`) and map `src/vendor/shaka/` imports to mocks in `jest.config.json` (the polyfills to no-op `install()`s).

## Tests
- `test/playback/shaka.spec.ts`: polyfills installed once and before the first `shaka.Player`; ABR cap from the session and the default; load with the start time; errors forwarded; `destroy()` unloads then destroys, also after a failed load.
- `test/playback/PlayerController.spec.ts` (HLS cases): load before the surface; play only after load + surface (either order); no `loadedmetadata` seek in HLS mode; reporter start after the first `playing`; Shaka error and rejected load → `onError` + reporter stop; `destroy()` order (Shaka before `deinitialize()`), `destroy()` during a pending load and during `initialize()`; URL-mode tests unchanged and passing.
- Run `npm test` once with `src/vendor/` moved away, to prove the mocks cover it.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release` (needs `src/vendor/`).
- No device check: 9c does it with 9a merged. If the release build fails because Metro can't bundle the vendored files (e.g. the polyfills' TypeScript or the compiled Shaka), fix it in `metro.config.js`/`babel.config.js` and say what you changed.

## Rules
- Source files: `src/playback/shaka.ts`, `src/playback/PlayerController.ts`, plus the Jest mocks and `jest.config.json` (and Metro/Babel config only if the build needs it). Tests as listed. Nothing else.
- Nothing from `src/vendor/` or Amazon's wrapper in a commit. Before committing, run `git status` and `git diff --cached` to confirm.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the adapter's API
- the Vega-specific Shaka steps you kept, and the ones you left out and why
- the HLS init and teardown order, and where it came from
- the test count (with and without `src/vendor/`), lint and build results
- edge cases and suggested tests
- anything only the TV can confirm (sequence mode, error codes, ABR cap)
