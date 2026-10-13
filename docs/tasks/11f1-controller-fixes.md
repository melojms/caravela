# Task 11f-1: player controller fixes (speed-change freeze, hang on leaving a frozen player)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11f1 (branch `task/11f1-controller-fixes`, from `main`).
Background: read docs/HANDOFF.md (Status: task 11, Follow-ups "Task 11, playback" and "Task 11, crash") and docs/PLAN.md ("Playback design") first, then `docs/tasks/11b-controller.md` (what built the rate and the watchdog). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

Other subtasks run in parallel: 11f-2 (`PlayerScreen.tsx`) and 11f-3 (`PlayerOverlay.tsx`). Stay inside your file scope.

## The bugs (seen on the Fire TV)
1. **Speed change while playing freezes direct play.** Twice, The AI Doc, right after a change around 4:17 (1× and 2× through that spot were fine). Vega does a rate change as `seekWithRate`; afterwards time updates stop (the device log says "No Time update even in Playing state") and **no `waiting` event** comes, so the stall watchdog never fires and the player sits there. A change made **while paused**, then Play, never froze.
2. **Leaving a frozen player kills the app.** `release()` calls the synchronous native `pause()`, which blocks the JS thread on the stuck pipeline; Vega kills the app (`AppNotResponding`, signal 3).

## Scope (only this)
**`src/playback/PlayerController.ts`** and `test/playback/PlayerController.spec.ts` (and the w3cmedia mock in `test/__mocks__/react-native-w3cmedia.ts` if it needs to grow; say so).

1. **Rate change as pause → set → play** (URL mode). In `setPlaybackRate` while playing (not paused, loaded, live): pause, apply the rate, then play. While paused or before load: just apply it, as now. Don't fire extra reporting for this internal pause/play if you can avoid it cleanly (it must not leave the watchdog suspended or the state stuck on `paused`; the overlay should not flash the paused state if avoidable, but correctness first). HLS keeps going through Shaka's `trickPlay` (`applyRate`) unchanged.
2. **Frozen-position check.** While the state is `playing` (not paused, not loading, not ended, live), poll `currentTime` every 2 s (export the constants, e.g. `FREEZE_POLL_MS = 2000`, `FREEZE_TIMEOUT_MS = 10000`). If the position hasn't moved for `FREEZE_TIMEOUT_MS`, mark the pipeline **stuck** and fail with `STALL_TIMEOUT_MESSAGE` (Retry already exists on the screen). Leaving `playing` (pause, waiting/seeking, ended, failed, destroyed) stops the poll; coming back to `playing` restarts it from the current position. A rate below 1 still moves the position, so 10 s is safe at 0.25×.
3. **Don't touch a stuck pipeline on leave.** Track when the position last moved (from `timeupdate` and the poll). In `release()`, treat the player as stuck if the freeze check fired, or if the state is `playing` and the position hasn't moved for more than ~3 s (export it, e.g. `STUCK_ON_RELEASE_MS = 3000`). When stuck: skip `pause()` and `clearSurfaceHandle`, still `await deinitialize()` (async, so it can't block the JS thread) and remove the listeners. Shaka's `destroy()` stays first in HLS. Not stuck: unchanged.
4. Keep everything else as is (init/teardown order, initial seek, reporting, the existing start/stall watchdog).

Read `node_modules/@amazon-devices/react-native-w3cmedia/dist/MediaPlayer.js` for how `pause()`, `playbackRate` and `currentTime` reach the native side (which are synchronous).

## Tests (bug first: write a failing test for each bug before the fix)
- Rate change while playing in URL mode: pause, rate, play in that order; while paused: rate only, no play; HLS: still Shaka, no pause/play; state ends up `playing`, watchdog not left suspended.
- **A speed change in an HLS session** (a HANDOFF test gap).
- Frozen check: no `timeupdate` and a fixed `currentTime` while `playing` → error with `STALL_TIMEOUT_MESSAGE` after 10 s; a moving position keeps it quiet; pause/waiting stop it; resume restarts it; nothing after destroy or ended.
- Release: a stuck player (freeze fired, or `playing` with no movement for >3 s) never calls `pause()` or `clearSurfaceHandle` but calls `deinitialize()`; a healthy one still pauses and clears.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone).
- No device or simulator check (the orchestrating session runs the Fire TV check after merging). Don't use the Fire TV.

## Rules
- Only the files listed in Scope. If something outside them is broken, say so in the report instead of changing it.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
A short summary: files changed, new exports (exact names and values), decisions where the brief left room, the test count and lint result, edge cases and suggested tests, anything unresolved.
