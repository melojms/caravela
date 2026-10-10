# Task 8c-1: player controller and player screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-08c1 (branch `task/08c1-player`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" steps 3, 5 and 9) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, `@amazon-devices/react-native-w3cmedia` ~2.3.4-rn-83 (already installed by 8a).
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app** where it applies. A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code): `app/src/main/java/org/jellyfin/androidtv/ui/playback/PlaybackController.java`, `VideoManager.java`, `ui/playback/rewrite/`.

**What's already on `main`** (use it, don't change it):
- `src/playback/types.ts`: `PlaybackSession`, `PlaybackResolution`, `PlaybackSnapshot`.
- `src/playback/resolver.ts`: `resolvePlayback(api, {itemId, userId, startMs, …})` → `{kind: 'play', session}` or `{kind: 'unavailable', reason, message}`; rejects on network/HTTP errors.
- `src/playback/reporting.ts`: `createPlaybackReporter(api, session, getSnapshot)` → `{start, update, stop}`. The promises never reject. Call `start()` once when playback first starts (after the initial seek), `update()` on play, pause and seek complete, `stop()` on exit, end or a fatal error (safe twice).
- `src/api/itemInfo.ts`: `formatMillis`, `msToTicks` / `ticksToMs`. `src/api/details.ts`: `detailsKeys`; `src/api/home.ts`: `homeKeys`.
- `test/__mocks__/react-native-w3cmedia.ts` (mapped in `jest.config.json`): only `MediaSource.isTypeSupported` so far.

**8c-2 comes after you:** it registers your screen in `RootNavigator`, wires Details' Resume/Play to `navigation.navigate('Player', …)` and does the simulator check. Don't touch `RootNavigator.tsx` or `DetailsScreen.tsx`.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Vega docs (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`): `react_native_for_vega_media_player.md`, `react_native_for_vega_media_player_architecture.md` (URL mode sample and the init/teardown order), `react_native_for_vega_media_troubleshooting.md`, and the w3cmedia API reference (https://developer.amazon.com/docs/vega-api/latest/README.amazon-devices_react-native-w3cmedia.html). The `amazon-devices-vega-media-player` skill has the same material. Amazon's `vega-video-sample` (https://github.com/AmazonAppDev/vega-video-sample) is the known-good reference on RN 0.83: a community post says URL playback worked there and not from the docs alone, so compare your surface/teardown code against it.
- Import `VideoPlayer`, `KeplerVideoSurfaceView` from the package root (`@amazon-devices/react-native-w3cmedia`); it exports them.
- Remote keys: `useTVEventHandler` from `@amazon-devices/react-native-kepler` (check the event names Vega sends for Select and play/pause).

## Scope (only this)
1. **`src/playback/PlayerController.ts`** (new): one wrapper over `VideoPlayer` in URL mode. No React in it.
   - `new PlayerController(api, session, listeners)` with listeners for state changes (loading / playing / paused / ended), position updates and errors.
   - Order from the Vega docs: `new VideoPlayer()` → `await initialize()` → add listeners → `setSurfaceHandle`. The surface can arrive before `initialize()` resolves: cache the handle and set it after. Set `src = session.url` once both are ready, with autoplay.
   - Resume: when `session.startMs > 0`, seek there once on `loadedmetadata` (before the first frame if Vega allows), then play.
   - Owns a reporter (`createPlaybackReporter`): `start()` on the first `playing` after the initial seek, `update()` on play / pause / `seeked`, `stop()` on `ended`, a fatal `error` and `destroy()`. `getSnapshot` reads `currentTime` (s → ms) and `paused`.
   - Methods: `attachSurface(handle)`, `detachSurface(handle)`, `togglePause()`, `play()`, `pause()`, `seekTo(ms)`, getters for position/duration/paused, and `destroy()` (idempotent): stop reporting, remove listeners, `deinitialize()`. Follow the doc's and the sample's teardown order, including what happens when the surface is destroyed after `destroy()`.
   - Map `MediaError` codes to a readable message.
2. **`src/screens/PlayerScreen.tsx`** (new), route `Player`:
   - Resolves with `resolvePlayback` (session `api` / user from `useSession()`), using the route's `itemId` and `startMs`. Not a TanStack query: a new PlaySessionId every time.
   - Full-screen `KeplerVideoSurfaceView` on black; its created/destroyed callbacks go to the controller.
   - States: a spinner while resolving / loading; `unavailable` → the message and a focused **Back** button; a rejected resolve or a player error → the message with **Retry** (focused) and **Back**. Use `FocusableButton`.
   - Select (and the remote's play/pause key) toggles pause. While paused (and while loading after a seek), show a minimal overlay at the bottom: the title, a thin progress bar, `formatMillis(position)` / `formatMillis(duration)`. Theme tokens from `src/theme`. The full controls are task 11, so nothing else.
   - Back: the stack pops; unmount destroys the controller (which sends stopped). `ended` → stopped, then `navigation.goBack()`.
   - On unmount, invalidate `detailsKeys.item(serverId, userId, itemId)` and `homeKeys.all(serverId, userId)` so the resume label and Continue watching are fresh on return.
   - Check whether Vega's screensaver needs anything while video plays; if it does, say so in the report rather than adding a package.
3. **`src/navigation/types.ts`**: add `Player: {itemId: string; title: string; startMs: number}`.
4. **Jest mock**: extend `test/__mocks__/react-native-w3cmedia.ts` with a fake `VideoPlayer` (an event target with `initialize` / `deinitialize` / `setSurfaceHandle` / `clearSurfaceHandle`, `src`, `currentTime`, `duration`, `paused`, `play` / `pause`, and a way for tests to fire events) and a `KeplerVideoSurfaceView` that tests can drive.

## Tests
- `test/playback/PlayerController.spec.ts`: `initialize` resolves before `setSurfaceHandle` even when the surface comes first; `src` set once; resume seeks once on `loadedmetadata` and not for `startMs: 0`; reporter start after the first `playing` only; update on play/pause/seeked; stop on ended, error and destroy; `destroy()` twice; events after destroy are ignored; error messages.
- `test/screens/PlayerScreen.spec.tsx`: spinner while resolving; `unavailable` message + Back; resolve error + Retry resolving again; Select toggles pause and shows the overlay with times; `ended` → `goBack`; unmount destroys the controller and invalidates the details and Home keys.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- No simulator check: nothing opens the screen yet (8c-2 does it).

## Rules
- Source files: `src/playback/PlayerController.ts`, `src/screens/PlayerScreen.tsx`, `src/navigation/types.ts`, plus the Jest mock. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the API 8c-2 uses (route params, what the screen does on Back and on end)
- the init/teardown order you used and where it came from (doc vs sample)
- the remote key event names you handle
- the test count and lint result
- edge cases and suggested tests
- anything unresolved (screensaver, things only a device can confirm)
