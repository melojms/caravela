# Task R1-a: leave the player when the app goes to the background

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r1a (branch `task/r1a-leave-on-background`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R1). Another agent runs **R1-b** at the same time in `../caravela-wt/task-r1b`; it only touches `src/playback/PlayerController.ts`, `test/playback/PlayerController.spec.ts` and `test/__mocks__/react-native-w3cmedia.ts`. Don't edit those. Both tasks use the Fire TV: hold `flock /tmp/caravela-device.lock` for a whole flow.

## Why
Amazon's lifecycle tests (`docs/PUBLISHING.md`, "Lifecycle tests Amazon runs") and Vega's media guidance want the player released when the app goes to the background: no audio on the launcher, resume works after relaunch. Today `PlayerScreen` ignores `AppState`. R1-0 (findings in `docs/HANDOFF.md`, "R1-0 lifecycle probe") checked on the Fire TV that Home, another app, the screensaver and an Alexa voice search all send `AppState` `background`, and that calling `navigation.goBack()` on it works: the existing unmount path destroys the controller (Amazon's order), sends stopped (answered in ~0.3 s), and the details page refetches on return (R1-c). JS is suspended ~4 s after `background`, so nothing may wait before starting the teardown. The probe code is on local branch `probe/r1-0b` (`src/screens/PlayerScreen.tsx`, "R1-0 probe v3"); read it, don't copy its `probe()` logging.

## Approach (approved)
- In `src/screens/PlayerScreen.tsx`: subscribe to `AppState` `change`; on `background`, leave the player with `navigation.goBack()` (the same `goBack` the screen already uses), so unmount does the teardown. Remove the subscription on unmount.
- Only `background` counts. `inactive`, `blur` / `focus` (an Alexa question sends those; R1-b handles audio focus) do nothing.
- Must work in every phase: loading/resolving, playing, paused, the error view, during a track-switch reload (10d: destroy → wait for stopped → re-resolve), with a picker or the chapter row open. Leaving must happen once even if `background` arrives twice. If the player isn't the focused screen (shouldn't happen), don't pop some other screen: check `navigation.isFocused()` or explain why it's not needed.
- No new screen-level pause-before-leave, no timers: teardown starts at once.
- Update the doc comment in `PlayerScreen.tsx` that describes how the screen leaves.

## Scope (only this)
`src/screens/PlayerScreen.tsx`, `test/screens/PlayerScreen.spec.tsx`. A third file only if really needed; say why.

## Tests (write them first and see them fail)
With `AppState.addEventListener` mocked (capture the `change` listener; see how `test/api/queryClient.spec.tsx` does it):
- `background` while playing → `goBack` once, the controller is destroyed and stopped is sent with the position (whatever the existing unmount tests check);
- `background` while loading (resolve pending), paused, on the error view, and during a track-switch reload → leaves once, no second session started afterwards;
- `background` twice → one `goBack`;
- `inactive` and `active` → nothing;
- unmount removes the subscription.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- **Fire TV** (`192.168.50.124:5555`, rules in `docs/HANDOFF.md` "How we work"; install with `vega device install-app -p build/armv7-release/caravela_armv7.vpkg -d 192.168.50.124:5555`, which keeps the sign-in; the TV is signed in as `demo` on the demo server). Start `loggingctl log -f` outside `flock`. `KEY_HOME` from `inputd-cli` doesn't work: background the app with `vega device launch-app -d 192.168.50.124:5555 -a com.amazon.keplerlauncherapp.main`, relaunch with `vega device launch-app … -a com.melojms.caravela.main`.
  1. Direct play: play ~15 s → background → screenshot of the launcher; log shows stopped sent; relaunch → details page (screenshot) → Resume continues near the position.
  2. Same with an HLS (remux/transcode) item.
  3. Background while paused, and while the player is still loading (right after pressing Play).
  4. After the relaunch, Back from details works normally and Home is fine.
  Screenshots and logs in your scratchpad, not the repo.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge. Never use `melojms`'s password; sign in as `demo` with an empty password if needed. Don't change anything on the demo server beyond resume points from playing.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, pass/fail per TV check with screenshot paths, edge cases you thought about and suggested further tests, anything odd.
