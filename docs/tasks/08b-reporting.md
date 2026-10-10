# Task 8b: playback reporting

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-08b (branch `task/08b-reporting`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" step 5) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin server 12.0+ (the test server runs 12.2).
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful files:
- `playback/jellyfin/src/main/kotlin/playsession/PlaySessionService.kt` (when start / progress / stopped are sent, the 3 s / 15 s cadence, the fields)
- `app/src/main/java/org/jellyfin/androidtv/util/apiclient/ReportingHelper.kt` and `ui/playback/PlaybackController.java` (`stopEncodingProcess` on exit)

**Another agent runs at the same time:**
- 8a (device profile and resolver) in `../caravela-wt/task-08a` adds `src/playback/deviceProfile.ts`, `src/playback/resolver.ts` and the `@amazon-devices/react-native-w3cmedia` package. **Don't touch those**, and don't add packages.
- The shared types are already on `main` in `src/playback/types.ts` (`PlaybackSession`, `PlaybackSnapshot`). **Don't change that file**; if a type doesn't fit, say so in the report.
- 8c (later) calls your reporter from `PlayerController.ts` / `PlayerScreen.tsx` on the player's play, pause, seek and exit events.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Use Context7 for the `@jellyfin/sdk` docs (`getPlaystateApi`: `reportPlaybackStart`, `reportPlaybackProgress`, `reportPlaybackStopped`; `getHlsSegmentApi` or wherever 1.0.0 puts `stopEncodingProcess`). Check the generated types in `node_modules/@jellyfin/sdk/lib/generated-client/models/` (`PlaybackStartInfo`, `PlaybackProgressInfo`, `PlaybackStopInfo`).

## Scope (only this)
**`src/playback/reporting.ts`** (new), porting `PlaySessionService.kt`:
- `createPlaybackReporter(api, session, getSnapshot, options?)` → a reporter. `getSnapshot: () => PlaybackSnapshot` reads the player's position and paused state. `options` for injecting timers in tests if fake timers aren't enough.
- Reporter methods (adjust the names if androidtv's events suggest better ones, and explain):
  - `start()`: `reportPlaybackStart`, then the progress timer.
  - `update()`: called on play, pause and seek. Sends a progress report right away and resets the timer to the new cadence.
  - `stop()`: stops the timer, sends `reportPlaybackStopped` with the last position, then `stopEncodingProcess(deviceId, playSessionId)` when `playMethod` isn't DirectPlay. Safe to call twice; after it, no more reports.
- Cadence: every **3 s** while playing, every **15 s** while paused.
- Each report sends: itemId, mediaSourceId, positionTicks (`msToTicks` from `src/api/itemInfo.ts`; reuse it, don't redefine it), playSessionId, playMethod, audio/subtitle stream indexes, isPaused, canSeek: true. Match the fields androidtv sends (e.g. `EventName`, `PlaybackStartTimeTicks`, `RepeatMode`) where the 12.0 API has them.
- Errors: a failed report must never break playback. Swallow it (log in `__DEV__`) and keep the timer going. Don't overlap requests: if a progress report is still in flight, skip that tick. `stop()` still sends stopped even if earlier reports failed.
- The device ID: `api.deviceInfo.id` (check the 1.0.0 `Api` shape).

## Tests
- `test/playback/reporting.spec.ts` with Jest fake timers and the SDK mocked like `test/api/home.spec.ts`: start sends start then progress at 3 s; pausing switches to 15 s; `update()` sends immediately and resets the timer; the payload fields and tick conversion; stopped carries the final position; `stopEncodingProcess` only for non-DirectPlay; a double `stop()`; no reports after stop; a rejected report doesn't stop the timer; an in-flight report skips the next tick.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`. No build or simulator check needed: nothing calls this yet.

## Rules
- Source files: `src/playback/reporting.ts`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported API (signatures) 8c will use, and when 8c should call each method
- what you took from androidtv (and anything deliberately different)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
