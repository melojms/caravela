# Task 7.5f: TV details and episode playback on the Fire TV

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075f (branch `task/075f-device-check`, from `task/075-tv-details`, which has 7.5a–7.5e merged).
Background: read docs/HANDOFF.md first, especially "How we work", "Signing in during a check", "Shared Fire TV", "Screenshot (Fire TV)" and "Remote input", plus the task 8–10 entries under Status. Then read docs/tasks/075*.md (what was built). Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Jellyfin 12.2.
The user has **already approved** this check on the Fire TV. Don't ask again for approval of the overall approach.

**What's on the branch:** every item opens `Details`, which picks a page by type (`src/screens/details/`: Movie, Series, Season, Episode, Person, Generic). Series Play/Resume plays its next-up episode (or the first episode when nothing is next up); Season Play/Resume plays its first unwatched episode; Episode is like the movie page plus Previous episode / Go to series. The Player already takes any `itemId`. It all passed on the simulator (UI only); episode playback has never run on the Fire TV.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, then `npm run build:release`. Use `build/armv7-release/caravela_armv7.vpkg` on the **Fire TV** (`192.168.50.124:5555`).
- Read `vega_cli_commands_reference.md` (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`) before using any Vega CLI command not already in HANDOFF.md.
- Every install / launch / input / screenshot flow runs inside `flock /tmp/caravela-device.lock -c '…'`; hold the lock for a whole flow. Log capture starts outside the lock, detached, stopped by pid.
- Install with `vega device install-app` (upgrades in place and keeps the sign-in). If the session is gone: add the server (address in `/home/melojms/projects/melojms-git/caravela/docs/LOCAL.md`) and sign in as **`demo` with an empty password**. Never use `melojms`'s password.
- Screenshots stay in your scratchpad (never in the repo), downscaled before viewing. Don't print tokens.
- To pick episodes, you may ask the server which play method an episode gets (PlaybackInfo / `/Sessions` while playing), as earlier device checks did.

## Checks (screenshot each)
1. Shows → a series → its page on the TV: layout, Play/Resume focused, rows, Up back to the buttons.
2. **Direct play episode:** an episode that direct plays (check with `/Sessions` → `PlayMethod`). Play from its episode page; it starts, Select pauses (overlay), Back leaves; Details and Home refresh (progress / Continue watching / Next up).
3. **Resume:** reopen that episode (past Jellyfin's 5% threshold first, or pick one that already has a position): Resume from … focused, it resumes at the right position.
4. **Transcode or remux episode:** an episode that goes HLS (DirectStream or Transcode, e.g. an incompatible audio codec or a burn-in subtitle). It starts (start time), subtitles/audio pickers still work, Back ends the transcode (`/Sessions`).
5. **Series Play / Resume:** from a series page it plays the next-up episode (check the item id / title in the player or `/Sessions`). If a series with everything watched exists, or nothing next up, Play opens its first episode.
6. **Season Play:** plays the first unwatched episode of that season.
7. Episode page from Home's Next up / Continue watching, Previous episode and Go to series, a cast card → person page, Back walks back. Focus is visible and never lost.
8. **Leave the server as you found it:** clear any resume points / watched states you created (Watched on then off resets both), and say what you changed.

## Fixes
- If something fails, find the cause (logs, screenshots, `/Sessions`). Fix it if it's in `src/screens/details/*` or `src/screens/DetailsScreen.tsx`: a failing test first, then the fix, then check again on the TV.
- Anything in playback (`src/playback/`, `PlayerScreen`) or bigger: stop and report with the evidence.

## Rules
- Commit fixes to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.
- Never commit screenshots.

## Done = report back
Finish with a short summary covering:
- each check with its result, the episodes used and their play methods, start times, screenshot paths
- fixes made (files, tests) and the test/lint result if any code changed
- what you changed on the server and whether it's restored
- edge cases and anything unresolved
