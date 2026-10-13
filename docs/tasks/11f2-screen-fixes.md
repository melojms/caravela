# Task 11f-2: player screen fixes (Retry position, missing tests)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11f2 (branch `task/11f2-screen-fixes`, from `main`).
Background: read docs/HANDOFF.md (Status: task 11, Follow-ups "Task 11: Retry…" and "Task 11 tests") and docs/PLAN.md ("Playback design") first, then `docs/tasks/11e-player-wiring.md`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

Other subtasks run in parallel: 11f-1 (`PlayerController.ts`) and 11f-3 (`PlayerOverlay.tsx`). Stay inside your file scope.

## The bug
**Retry after an error restarts near 0:00 instead of the last position.** Seen on the Fire TV after a decode error. `onError` in `src/screens/PlayerScreen.tsx` reads `controller.positionMs`, but by then the player has reset it. Note that `onStateChange` also does `positions.emit(controller.positionMs)`, so the position feed may already hold the reset value too: keep the **last position the controller reported while it was healthy** (from `onPositionChange`, before the error) and resume from that. A position of 0 reported after an error must not overwrite a real one. Also check the same for the track-switch reload path (`resumeFromRef.current = controller.positionMs` around line 477).

## Scope (only this)
**`src/screens/PlayerScreen.tsx`** (and `src/screens/usePlayerOverlay.ts` only if a test exposes a bug there), with `test/screens/PlayerScreen.spec.tsx`. For "several media sources", the test may go in `test/playback/resolver.spec.ts` if that's where the source is chosen; don't change `resolver.ts` unless a test shows a bug (then say so).

1. Fix the Retry position (bug-first: a failing test, then the fix).
2. Add the HANDOFF test gaps for the screen:
   - Back mid-scrub (cancels the scrub / hides the overlay; doesn't seek; a second Back leaves).
   - A fast-forward key during a track-switch reload (no seek on the dead controller, no crash; decide what's right and say so).
   - A duration change mid-scrub (the cursor stays within the new duration).
   - An item with several media sources (the chosen source's trickplay/chapters/streams are the ones used).
   - Retry resumes at the last reported position; a track switch keeps the right position.
3. If a test reveals another bug in your scope, fix it and report it.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone).
- No device or simulator check (the orchestrating session runs the Fire TV check after merging). Don't use the Fire TV.

## Rules
- Only the files listed in Scope. If something outside them is broken, say so in the report instead of changing it.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
A short summary: files changed, the fix, the tests added (and the count), lint result, decisions where the brief left room, edge cases and suggested tests, anything unresolved.
