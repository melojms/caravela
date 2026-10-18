# Task R7-d/e/f: lifecycle UI fixes from the R1-d run

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r7def (branch `task/r7def-lifecycle-ui`).
**The approach is not approved yet.** Read the code, then describe your approach for each of the three fixes (files, the change, tests, and for R7-d the trade-offs) and **wait for the user's OK in this pane before writing any code.**

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R7 fixes). R7a (sign-in crash) already exists; R7-b and R7-c are other R1-d follow-ups, not part of this task. No other agent uses the Fire TV right now, but run every device step inside `flock /tmp/caravela-device.lock -c '…'` (see "How we work" in `docs/HANDOFF.md`).

## Where these come from
R1-d ran Amazon's nine lifecycle tests on a clean Release build (0.1.1, build 1001) on the Fire TV. Its brief with the full results is on branch `task/r1d-lifecycle-run` (`git show task/r1d-lifecycle-run:docs/tasks/r1d-lifecycle-run.md`), not on `main` yet. The relevant findings:

### R7-d: the screensaver lands on Details, not on a paused player
Amazon's test: pause, idle 5 min until the screensaver, Back → "still paused, no audio over the screensaver, back in the app". What happens: the screensaver backgrounds the app (lcm `BACKGROUND`), and R1-a's handler in `src/screens/PlayerScreen.tsx` (`AppState` `background` → `goBack()`) leaves the player, which releases it and sends stopped. Back from the screensaver returns warm to **Details** with Resume at exactly the paused position. Position is right; the screen isn't.
Same path for Home and another app (tests 2/3): there, Details → Resume is fine for Amazon, but returning to a paused player would be too.
Constraints that must keep holding (R1-a, R1-0 probe, R5, R6; see `docs/HANDOFF.md` Status and Follow-ups):
- In the background the player must be released (no audio on the launcher or over the screensaver), and JS is suspended about 4 s after `background`: the release and the stopped report have to happen right away.
- The OS sometimes kills the app right after a background (`MRM killed`, 1 in 6 backgrounds in R1-d, about 2 in 6 in R1-0). A kill must still leave a correct resume point on the server, and the next launch is a cold start on Home.
- `inactive` and blur/focus (an Alexa question) must keep playing (Vega pauses and resumes by itself).
- Media Controls (R6), the audio output watcher (R5) and the session reporting must not leak or double up across a background/foreground cycle.
- Nothing may autoplay on return: come back **paused**, at the position the player was at.

### R7-e: Home focus after coming back from the player (low)
After Back from the player, Home reloads Continue watching and the item just played moves to the front, but focus stays on the same slot index, so it now sits on a different item. Seen with both the R1-d content items. The focus-restoring code is in `src/screens/HomeScreen.tsx` (last focused row/card with its native tag, `useFocusEffect`, the "focuses the last card again" delay). Expected: focus follows the item it was on (or another rule you propose; say which and why).

### R7-f: stale "Ends" time on Details after a warm relaunch (low)
After backgrounding and a warm relaunch, Details showed "Ends 13:45" that had been computed before the background (the real end was ~13:49). "Ends" comes from `src/api/itemInfo.ts` (`endTime(item, now)` → `formatClock`), with `now` passed in by the details screens. Expected: it is right whenever Details is shown (after a return from the background, from the player, or after sitting on the screen for a while). For comparison, the player's "Ends at" (`src/components/SeekBar.tsx`) refreshes every 30 s, and `src/components/ToolbarClock.tsx` ticks on the minute.

## Scope
Expected files: `src/screens/PlayerScreen.tsx` (and whatever it needs under `src/playback/`), `src/screens/HomeScreen.tsx`, `src/api/itemInfo.ts` and the details screens under `src/screens/details/`, plus their tests under `test/`. If you need more, say so in your approach. No changes to the manifest, build scripts or dependencies.

## Tests
Write them first and see them fail (Jest; see Gotchas in `docs/HANDOFF.md` for the test setup). At least: R7-d background → foreground leaves the player mounted and paused at the same position, with the player released in between (and the existing R1-a tests updated, not deleted); R7-e focus goes to the same item after the list reorders; R7-f "Ends" changes after time passes / after `active`.

## Checks
1. `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
2. `npm run lint`, `npm test`, `npm run build:release`.
3. On the **Fire TV** (`192.168.50.124:5555`), install in place with `vega device install-app` (not `run-app`, which wipes the storage; the TV is signed in as `demo` on the test server, see `docs/LOCAL.md` in the main checkout). Use the "How we work" commands for screenshots, keys, backgrounding (`com.amazon.smplighthouse.launcher.main`) and warm relaunch (`vmsgr send pkg://com.melojms.caravela.main`). Device log as in R1-d: `loggingctl log -f` outside `flock`, stop it by pid.
   - R7-d: with direct play (The Grand Tour S1E1) and HLS (Another Simple Favor): play 30 s, background, warm relaunch → the paused player at the same position, Play continues, `/Sessions` correct in between. Then pause and wait for the screensaver (5 min idle), Back → the paused player. Note any `MRM killed` and what the cold start shows then.
   - R7-e: play from Continue watching, Back to Home: focus on the same item.
   - R7-f: open Details, background for a few minutes, warm relaunch: "Ends" is current.
   - Anything sensory (audio on the launcher or over the screensaver) goes through the user: print **one line starting with `USER ACTION:`** and wait for the answer.
4. Screenshots and logs stay in your scratchpad, never in the repo. List any `demo` resume points you change.

## Done
Commit on the branch (no Co-Authored-By or Claude-Session trailers), don't push or merge. Report: what changed per fix, test and lint results, the device check results with log times, anything you left out and why.
