# Task R6a: route Vega Media Controls (Alexa, remote media keys) through PlayerController

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r6a (branch `task/r6a-media-controls`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R6). Another agent runs **R6b** at the same time in `../caravela-wt/task-r6b`; it touches `manifest.toml`, `package.json`/`package-lock.json`, `src/screens/PlayerScreen.tsx`, `src/screens/usePlayerOverlay.ts` and their tests. Don't edit those. **No Fire TV check in this task** (Media Controls need R6b's manifest; the orchestrating session checks both together after merging).

## Why
Alexa "pause" / "play" did nothing during playback. Voice commands only reach an app that declares Vega Media Controls (KMC) in its manifest (R6b) and gives a player the focus. The probe (branch `probe/r6`, worktree `../caravela-wt/probe-r6`; read its diff against `main`) did both with w3cmedia's default handler wrapped in a logger, and on the Fire TV every command arrived:

| Alexa / remote | Handler called | Default handler's effect |
|---|---|---|
| "pause", "stop" | `handlePause(undefined, {source: 'USER'})` | `player.pause()`; **no `pause` event** (see below) |
| "resume", "play" | `handlePlay()` | `play` → `playing` |
| "skip forward 30 seconds" | `handleSkipForward({seconds: 30, nanoseconds: 0})` | seek +30 s |
| "rewind 10 seconds" | `handleSkipBackward({seconds: 10, nanoseconds: 0})` | seek −10 s |
| remote ⏯ | `handleTogglePlayPause()` (then the default calls `handlePause`/`handlePlay`) | pause / play |
| remote ⏩ / ⏪ | `handleFastForward()` / `handleRewind()` | seek |

Vega also calls `handleGetSessionState` often and `handleGetMetadataInfo(mediaId)` a few times; the default `handleGetMetadataInfo` **throws**.

**The bug to fix:** every voice command arrives while Alexa holds the audio focus (`audiofocuspaused` ~2 s before the command, `audiofocusgranted` ~0.2 s after; see R1-b's "held" state in the `PlayerController` class doc). `player.pause()` during the hold produced no `pause` event, so the controller stays `playing`: the overlay doesn't show paused, the server isn't told, and once `audiofocusgranted` re-arms the freeze check, "Playback stopped" fires 10 s later. `handlePlay` during the hold did produce `play` + `playing`.

## Approach (approved)
1. **New `src/playback/mediaControls.ts`**: a class extending `KeplerMediaControlHandler` (from `@amazon-devices/react-native-w3cmedia`; read `dist/interface/KeplerMediaControlHandler.d.ts` and `dist/mediacontrolhandler/MediaControlHandler.js`) that sends commands to a small target interface the controller implements (play, pause, togglePlayPause, seekTo, seekBy, positionMs, title). Override:
   - `handlePlay` → play; `handlePause` and `handleStop` → pause (the user chose: "Alexa, stop" pauses, it doesn't leave the player); `handleTogglePlayPause` → toggle.
   - `handleSkipForward(delta)` / `handleSkipBackward(delta)` → `seekBy(±delta in ms)` (`ITimeValue` is `{seconds, nanoseconds}`).
   - `handleFastForward` / `handleRewind` (the remote's ⏩ / ⏪) → `seekBy(SEEK_FORWARD_STEP_MS)` / `seekBy(-SEEK_BACK_STEP_MS)` from `src/components/SeekBar.ts` (+30 s / −10 s, the overlay's buttons; they were ±10 s since R1-b).
   - `handleSeek(position)` → `seekTo(ms)`; `handleStartOver` → `seekTo(0)`.
   - `handleGetMetadataInfo` → a valid `IMediaMetadata` with the item's title (look up the type in `@amazon-devices/kepler-media-controls`' typings) instead of throwing.
   - Leave `handleGetSessionState` and everything else to the default (overriding the session state broke things for another developer; it's a follow-up).
   - Don't call `super` for the overridden commands: the controller does the work.
   Import types from `@amazon-devices/kepler-media-controls` with `import type` only (R6b adds it to `package.json`; it's installed already).
2. **`src/playback/PlayerController.ts`**:
   - When `options.componentInstance` is set (the option is already on `main`), call `await this.player.setMediaControlFocus(componentInstance, handler)` **before** `this.player.initialize()` (Amazon's doc and the probe). A failure only logs a warning; playback goes on. Check what `destroy()` must do (if anything) to drop the focus; read w3cmedia's `MediaPlayer.js` `deinitialize`.
   - **Pause while held:** if `pause()` is called while `held`, after `player.pause()` the controller goes to paused itself (the same thing `onPause` does: suspended, watchdog off, state `paused`, report) and doesn't depend on a `pause` event; a later real `pause` event must be harmless. Then `audiofocusgranted` must not restart the freeze check or the watchdog while paused (check R1-b's code already handles "paused by the user, then focus events"). `play()` from paused then works as today (`play` / `playing` events come).
   - Add `togglePlayPause` if the controller doesn't already expose it publicly (there's a toggle near `play()`; reuse it).
   - Update the class doc comment (Media Controls, pause while held).
3. **Tests first**, see them fail:
   - `test/playback/mediaControls.spec.ts`: each handler method → the right target call (delta conversion incl. nanoseconds, stop → pause, ⏩/⏪ steps, seek, start over), metadata returns the title and doesn't throw.
   - `test/playback/PlayerController.spec.ts`: focus set before `initialize()` with the component instance; not called without one; a throwing `setMediaControlFocus` still plays; pause while held → state paused, reported paused, no freeze error after > `FREEZE_TIMEOUT_MS` and after `audiofocusgranted`; then `play()` → playing and checks back on; a late real `pause` event after that is harmless; URL and HLS modes where the code differs.
   - `test/__mocks__/react-native-w3cmedia.ts`: add `KeplerMediaControlHandler` (a plain class) and `setMediaControlFocus` on the mock player.

## Scope (only this)
`src/playback/mediaControls.ts` (new), `src/playback/PlayerController.ts`, `test/playback/mediaControls.spec.ts` (new), `test/playback/PlayerController.spec.ts`, `test/__mocks__/react-native-w3cmedia.ts`.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors; `test/playback/trickplay.spec.ts` and `src/navigation/RootNavigator.tsx` have known ones on `main`), full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, edge cases you thought about and suggested further tests, anything odd (e.g. what `deinitialize` does with the focus).
