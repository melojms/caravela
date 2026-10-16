# Task R1-b: don't fail playback when Alexa takes the audio

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r1b (branch `task/r1b-audio-focus`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R1). Another agent runs **R1-a** at the same time in `../caravela-wt/task-r1a`; it only touches `src/screens/PlayerScreen.tsx` and `test/screens/PlayerScreen.spec.tsx`. Don't edit those. Both tasks use the Fire TV: hold `flock /tmp/caravela-device.lock` for a whole flow.

## Why
Amazon's lifecycle test: "Alexa query during playback: video pauses, no audio overlap, playback resumes after the card closes". R1-0 (findings in `docs/HANDOFF.md`, "R1-0 lifecycle probe") showed on the Fire TV that a plain Alexa question doesn't change `AppState`. Instead Vega pauses the pipeline itself and the `VideoPlayer` emits the custom event **`audiofocuspaused`** (no `pause` event; `paused` stays `false`). When Alexa stops talking (3–12 s later) it emits **`audiofocusgranted`** (then `playbackstarted`) and **resumes playback by itself** at the same position. On `main`, the freeze check (11f-1: 10 s without the position moving while `playing`) fires first and shows "Playback stopped. Check your connection". The probe (local branch `probe/r1-0b`, `PlayerController.ts`, "R1-0 probe v3") stopped the freeze check on `audiofocuspaused`, and Alexa then resumed cleanly. The events are documented in `node_modules/@amazon-devices/react-native-w3cmedia/dist/interface/HTMLMediaElement.d.ts`, together with a third one, **`audiofocuslost`** (permanent loss; not seen in R1-0).

## Approach (approved)
In `src/playback/PlayerController.ts`:
- Listen for `audiofocuspaused`, `audiofocusgranted` and `audiofocuslost` along with the other media events (registered and removed the same way; check what `addEventListener` accepts in the typings).
- `audiofocuspaused`: the player is "held by the system". Stop the freeze check and the stall watchdog, and keep them off while held (anything that would re-arm them, e.g. `waiting` / Shaka buffering / `progress`, must not while held).
- `audiofocusgranted`: no longer held. If the player is playing, restart the freeze check from the current position and re-arm the watchdog as it would be after `playing`. Don't call `play()`: Vega resumes by itself.
- `audiofocuslost`: Vega won't resume. Call the controller's normal pause path, so the state/overlay shows paused and the user can press Play. Clear the held flag. Write in the report that this path is untested on the device.
- Reporting: no change (the user chose not to report `isPaused` or show the overlay as paused during a temporary interruption).
- `destroy()` while held works as today.
- Document the held state in the class doc comment next to the freeze-check / watchdog notes.

## Scope (only this)
`src/playback/PlayerController.ts`, `test/playback/PlayerController.spec.ts`, and `test/__mocks__/react-native-w3cmedia.ts` only if the mock needs anything for custom events (it probably already fires arbitrary types).

## Tests (write them first and see them fail)
- Playing, `audiofocuspaused`, position stuck for > `FREEZE_TIMEOUT_MS` and > the 30 s stall time → no error.
- Then `audiofocusgranted` and the position moves → still fine; then the position sticks for > `FREEZE_TIMEOUT_MS` → the freeze error fires again (checks are back on).
- `waiting` / buffering while held doesn't arm the watchdog.
- `audiofocuslost` → `pause()` called, state paused, no error later.
- `audiofocusgranted` without a prior `audiofocuspaused` is harmless.
- Paused by the user, then focus events → still paused, no `play()`.
- `destroy()` while held removes the listeners and sends stopped as usual.
- Both URL and HLS (Shaka) modes where the code differs.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- **Fire TV** (`192.168.50.124:5555`, rules in `docs/HANDOFF.md` "How we work"; install with `vega device install-app -p build/armv7-release/caravela_armv7.vpkg -d 192.168.50.124:5555`, which keeps the sign-in; the TV is signed in as `demo` on the demo server). Start `loggingctl log -f` outside `flock`. The Alexa question needs the **user's voice**: get the player playing (direct play first, then an HLS item), then print on its own line `USER ACTION: ask Alexa "What's the weather?" now, then reply "done" in this pane` and wait for the reply. Pass = no "Playback stopped" error, playback resumes by itself after the card, position keeps going; find `audiofocuspaused` / `audiofocusgranted` in the log. Then let it play 30 s more to show the freeze check still works normally (no false error). Screenshots and logs in your scratchpad, not the repo.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge. Never use `melojms`'s password. Don't change anything on the demo server beyond resume points from playing.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, pass/fail per TV check with screenshot paths, edge cases you thought about and suggested further tests, anything odd.
