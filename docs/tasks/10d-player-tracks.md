# Task 10d: subtitles and audio track switching in the player

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10d (branch `task/10d-player-tracks`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" steps 3–5) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code): `app/src/main/java/org/jellyfin/androidtv/ui/playback/overlay/action/SelectAudioAction.kt`, `ClosedCaptionsAction.kt`, `PlayPauseAction.kt`, and `ui/playback/PlaybackController.kt` (`switchAudioStream`, `switchSubtitleStream`, when it re-requests PlaybackInfo and when it switches in the player).

## The task 10 approach (approved)
- **Subtitles are drawn by the app** (not `KeplerCaptionsView`). Text subtitles are `external` tracks with a WebVTT `vttUrl`; switching between them, or to Off, is **client-side** (no new session).
- ASS/SSA/PGS/DVD are `burn-in` tracks: switching **to** one, or **from** the burned-in one to anything else, re-resolves at the current position with the new `SubtitleStreamIndex`.
- **Every audio switch re-resolves** with the new `AudioStreamIndex`, keeping the current subtitle choice.
- **A re-resolve stops first:** destroy the current controller (that sends `reportPlaybackStopped`, which also ends a running transcode; there's no `stopEncodingProcess` in SDK 1.0.0 / 12.2), **wait for it**, then call `resolvePlayback` with the new indexes and `startMs` = the position when the switch was picked, then start a new controller. Playback continues (plays) after the reload.
- The picker is only on the player's paused overlay for now. Task 11 redoes the overlay; pickers on Details are out of scope.

**What's already on `main`** (use it):
- `src/playback/types.ts`: `MediaTrack`, `SubtitleTrack` (`delivery: 'external' | 'burn-in'`, `vttUrl?`), `PlaybackSession.audioTracks?` / `subtitleTracks?` / `audioStreamIndex?` / `subtitleStreamIndex?` (`-1` = off), `PlaybackSnapshot.audioStreamIndex?` / `subtitleStreamIndex?`.
- `src/playback/resolver.ts`: fills the tracks; `PlaybackRequest` takes `audioStreamIndex` / `subtitleStreamIndex`. `EnableSubtitlesInManifest` is now false.
- `src/playback/reporting.ts`: reports use the snapshot's indexes, falling back to the session's. (`PlaybackStopInfo` has no index fields; that's expected.)
- `src/playback/subtitles.ts`: `useSubtitleCues(vttUrl?)` → `{cues, loading, error?}` (cached per URL, error messages never contain the URL), `activeCues(cues, positionMs)`.
- `src/components/SubtitleView.tsx`: `<SubtitleView cues={active} style?={…} />`, `DEFAULT_SUBTITLE_STYLE` (absolutely positioned, `pointerEvents="none"`).
- `src/components/TrackPicker.tsx`: `TrackPicker({title, tracks, selectedIndex?, offLabel?, onSelect, onClose})`, `TRACK_OFF_INDEX = -1`. Pass `offLabel="None"` for subtitles (androidtv's wording). It traps focus, handles Back itself (its `BackHandler` listener runs first), and **doesn't close itself** after a pick.
- Don't change these files unless something is broken; if you must, say why in the report.

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.

## Scope (only this)
1. **`src/playback/PlayerController.ts`**: a way to set the subtitle index shown client-side (e.g. `setSubtitleStreamIndex(index)`), included in the reporter's snapshot (with the session's `audioStreamIndex`), and an immediate progress report when it changes (`reporter.update()`), like a pause does. Nothing else changes in the controller.
2. **`src/screens/PlayerScreen.tsx`** (you may move the new subtitle/track UI into **one** new file under `src/screens/` or `src/components/` if PlayerScreen gets too long; max 3 source files in total):
   - **Chosen tracks:** keep the user's audio/subtitle choice in refs/state that the resolve effect sends with `resolvePlayback`, so Retry and later re-resolves keep them. Before any choice, send nothing (the server's defaults apply; they follow the user's Jellyfin language settings).
   - **Showing subtitles:** the current subtitle is the session's `subtitleStreamIndex` until the user changes it client-side. If it's an `external` track, load its cues with `useSubtitleCues` and draw `activeCues` at the player position with `SubtitleView`, above the video and below the overlay/picker. A `burn-in` or `-1` index draws nothing. **Position updates while playing:** the screen deliberately skips renders on `timeupdate` while playing; keep that. Drive subtitles from a small child component that gets positions without re-rendering the whole screen (e.g. a subscription/ref) and only sets state when the set of active cues changes. A cue load error shows nothing and must not stop playback (a short dev-only warning without the URL is fine).
   - **Paused overlay:** add focusable buttons: **Play** (first, focused when the overlay opens; resumes playback), **Audio** (only when there's more than one audio track; check what androidtv does and follow it), **Subtitles** (only when there's at least one subtitle track). Use `FocusableButton`. While the overlay is showing, `select`/`enter` must press the focused button and **not** toggle pause through the screen's `useTVEventHandler`; the remote's play/pause keys (`play`, `playpause`, `pause`) keep working everywhere.
   - **Pickers:** Audio/Subtitles open `TrackPicker` with the current index selected. While a picker is open, playback stays paused, `select`/`enter` don't reach the pause toggle, and Back closes only the picker. On close (Back or a pick) focus returns to the button that opened it.
   - **On a pick** (close the picker first; picking the current index just closes):
     - external/Off → external/Off: client-side (`setSubtitleStreamIndex` on the controller, new cues), still paused.
     - to or from a `burn-in` subtitle, or any audio change: the stop-then-resolve flow above, at the paused position. Show the existing spinner while it runs; errors use the existing error view with Retry (which keeps the new choice).
   - Re-resolve must not race: a second pick while one is in flight wins and the first result is dropped; leaving the screen during it sends nothing more and doesn't start a player.
   - Exit / `ended` / invalidating details and Home keep working as now.
3. No other source files.

## Tests
- `test/playback/PlayerController.spec.ts` (or the existing controller spec): the subtitle index setter changes the snapshot and sends a progress report; the audio index comes from the session.
- `test/screens/PlayerScreen.spec.tsx` (extend the existing spec; mock the resolver/controller as it already does):
  - overlay buttons: Play focused first; Audio hidden with one audio track; Subtitles hidden with none; Select on the overlay doesn't toggle pause but the play key does
  - picker opens with the current track; Back closes only the picker; focus target after close
  - external → external / Off: no new resolve, controller setter called, cues switch
  - audio change and burn-in in/out: old controller destroyed **before** `resolvePlayback` is called, called with the right indexes and the paused position; then a new controller
  - Retry after a switch keeps the chosen indexes; a second switch while the first resolve is pending wins; unmount during a switch starts nothing
  - subtitles drawn at the right position while playing without re-rendering the screen per `timeupdate` (e.g. the screen's render count or `setPosition` not called), nothing drawn for burn-in / `-1`, load error doesn't crash

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- **Vega simulator UI check** (playback stalls 3–6 s in on the simulator, which is fine for this: pause before or when it stalls). See "Vega Virtual Device" in HANDOFF Gotchas; run every install/input/screenshot inside `flock /tmp/caravela-sim.lock -c '…'`. Build release, `vega run-app` on `VirtualDevice`, sign in with **Quick Connect**: print the code on its own line as `QUICK CONNECT CODE: <code>`, keep polling, and fetch a new code if one expires; the user approves it. Never use a password. Open a movie with several audio and subtitle tracks (search the test library for one; the server address is in docs/LOCAL.md in the main checkout), play, pause, and check: the overlay buttons and focus, the Subtitles picker opening/closing with Back, picking a text subtitle (subtitles may or may not show on the simulator; note what you see), and an audio switch reloading at the position. Keep screenshots in your scratchpad, never in the repo; they can show the server address.
- The Fire TV check is a separate step (10e) the orchestrating session runs; don't use the Fire TV.

## Rules
- Source files: `src/playback/PlayerController.ts`, `src/screens/PlayerScreen.tsx`, plus at most one new file. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed, the switch flow (which picks re-resolve and in what order things happen), and how subtitles follow the position
- what androidtv does for the Audio button with one track, and what you did
- the screenshot paths and what you saw on the simulator (including whether subtitles drew)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
