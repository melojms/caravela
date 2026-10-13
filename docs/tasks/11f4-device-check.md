# Task 11f-4: Fire TV check of the task 11 fixes, README player screenshot

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11f3 (branch `task/11f3-overlay-scrim`, rebased on `main`, which now has 11f-1 and 11f-2). The branch holds all three fixes; lint, tsc, Jest (1377) and `npm run build:release` already pass on it.
Background: read docs/HANDOFF.md ("How we work": Shared Fire TV, Screenshot (Fire TV), Remote input, Player checks, Device log; Gotchas: Vega Virtual Device) and the three briefs `docs/tasks/11f1-*.md`, `11f2-*.md`, `11f3-*.md`.
The user has **already approved** this. Don't ask again for approval of the overall approach.

## Rules for the TV
- Fire TV `192.168.50.124:5555`. Every install, launch, input or screenshot inside `flock /tmp/caravela-device.lock -c '…'`; hold the lock for a whole flow. Never start `loggingctl log -f` inside the lock: start it outside, detached, and kill it by pid.
- Install: `vega run-app build/armv7-release/caravela_armv7.vpkg com.melojms.caravela.main -d 192.168.50.124:5555` (wipes storage). Sign in on the user's server as `demo` with an **empty password**. Never use `melojms`.
- Player keys: press **Down** first (focuses Play/Pause whether the overlay is up or not); see HANDOFF "Player checks" for why.
- Screenshots go to your scratchpad (downscale with PIL before viewing). Never into the repo.

## Fire TV checks (keep the device log running for all of them)
1. **Speed change while playing** (the freeze): The AI Doc, direct play. Seek to about 4:00, play, and while playing change the speed several times around 4:17 (e.g. 1× → 2× → 1× → 1.5× → 1×), then let it play 30 s each time. Expected: no freeze; the position keeps moving (check with two screenshots or Down presses a few seconds apart); no "No Time update even in Playing state" in the log. Repeat the whole thing at least 3 times. Also a speed change in an HLS item (Another Simple Favor).
2. **Leaving the player**: Back out of a playing item right after a speed change, and out of a paused one. Expected: Home/details come back, no `AppNotResponding` / `crashed with signal 3` in the log. If you manage to get a frozen player at any point (by any means), wait for the "Playback stopped" error (about 10–12 s) and also try Back **before** it shows: the app must not be killed. Say clearly whether a freeze happened at all.
3. **Freeze check doesn't misfire**: play 2+ minutes of direct play and 2+ minutes of HLS with no input, plus a long pause (1 min) then Play. Expected: no "Playback stopped" error.
4. **Retry position**: only if an error shows up naturally (don't break the server or the network). Then press Retry and check it resumes near where it stopped. Otherwise report "not reproduced".
5. **Scrims**: overlay up, paused, over a bright frame and a dark frame. Look at the top and bottom fades: no stripes, no seam at the solid part. Compare the darkness with the simulator shots from 11f-3 (the stop opacity compensation; see 11f-3's report in its commit `c537357` message or the code comment). Report whether the middle of the fade looks too dark on the TV.
6. **Trickplay** on a real sheet: the user's server now has trickplay data. Find an item with it (the item's `Trickplay` field via the API as `demo`, or just try a few movies). Scrub on the seek bar: the thumbnail matches the frame, changes as you move, and works near the end (the last, shorter sheet).

## README screenshot (simulator, not the TV)
`docs/screenshots/readme/player.jpg` still shows the task 10 overlay. Retake it on the **simulator** with the Jellyfin demo server (`demo.jellyfin.org/stable`, `demo`, empty password; Pioneer One; don't change anything there). Use the full-size capture in HANDOFF Gotchas (`--display-res 1920,1080` + `scripts/sim-window-resize.py`), the overlay up and paused on a frame with something to see, then `convert in.png -resize 1280x720 -strip -interlace Plane -quality 85 docs/screenshots/readme/player.jpg`. Look at it yourself: no spinner, nothing cut off, no server address, no avatar. Check the alt text in README.md still fits. Restart the simulator without `--display-res` afterwards. Commit the image (no trailers).

## Rules
- Don't change source code. If a check fails, stop and report it with the log excerpt and screenshots; don't fix it.
- Commit only the screenshot. Don't push, don't merge.

## Done = report back
A short pass/fail per check (with how many times you repeated 1), relevant log lines, screenshot paths, the trickplay item used, and anything odd.
