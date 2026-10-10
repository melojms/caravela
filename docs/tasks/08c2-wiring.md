# Task 8c-2: open the player from Details, and check playback on the simulator

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-08c2 (branch `task/08c2-wiring`, from `main`).
Background: read docs/HANDOFF.md (especially "How we work", "Signing in during a check" and the simulator notes under Gotchas) and docs/PLAN.md ("Playback design") first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**What's already on `main`:**
- `src/screens/PlayerScreen.tsx` (route `Player: {itemId, title, startMs}` in `src/navigation/types.ts`): resolves with `resolvePlayback`, plays in URL mode through `src/playback/PlayerController.ts`, reports to the server, Select / play-pause toggles pause with a small overlay, Back pops (stopped is sent), `ended` → `goBack()`, and on unmount it invalidates the item's details and Home. Files that need transcoding show "can't play yet" with Back.
- `src/screens/DetailsScreen.tsx`: Resume (when resumable, focused) and Play buttons call `onPlay(startMs)`, which is still a no-op (`const onPlay = (_startMs: number) => undefined;`). Resume passes `resumePositionMs(item)`; Play passes 0.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Read `vega_cli_commands_reference.md` (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`) before using a Vega CLI command that isn't in HANDOFF.md.

## Scope (only this)
1. **`src/navigation/RootNavigator.tsx`**: register `Player` (`PlayerScreen`) in the signed-in stack, no header, like the other screens. Pick the transition that fits a full-screen player (e.g. no animation) if the native stack supports it on Vega.
2. **`src/screens/DetailsScreen.tsx`**: replace the no-op with `navigation.navigate('Player', {itemId, title, startMs})` (use `navigate`, so pressing Play twice doesn't stack two players). Only movies reach `MovieDetails`, so episodes stay on the placeholder.
3. Tests: update `test/screens/DetailsScreen.spec.tsx` (Resume navigates with the resume position, Play with 0, the title is passed) and, if it covers the stack's screens, `test/auth/RootNavigator.spec.tsx`.

## Simulator check (required)
Use the **Vega simulator** (HANDOFF.md Gotchas). It may already be running (`vega virtual-device status`); start it if not. Run every install / input / screenshot flow inside `flock /tmp/caravela-sim.lock -c '…'`. Screenshots stay in the scratchpad, never in the repo (they can show the server address).
1. `npm run build:release`, then `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice`. Keep any `[[needs.module]]` the build adds to `manifest.toml`.
2. The install wipes storage: add the server (the address in docs/LOCAL.md) and sign in as `melojms` with **Quick Connect**. Print the code on its own line as `QUICK CONNECT CODE: <code>`, keep polling, and fetch a new code if one expires. The user approves it in jellyfin-web. **Never use the password.**
3. From Home, open a movie and press **Play**. Find one that direct plays (an h264/aac mp4 or mkv is the best bet). If you get "can't play yet", that file needs transcoding (task 9): go Back and try another. Note which ones did what.
4. Check, with a screenshot for each:
   - video frames show (not black, not the spinner forever);
   - Select pauses and shows the overlay with the title, the progress bar and the times; Select again resumes;
   - after about 20 s of playback, Back returns to Details, and Details now shows **Resume from …** near where you stopped (that comes from the server, so it proves start/progress/stopped reached it);
   - **Resume** starts near that position, not from 0;
   - a file that needs transcoding shows the message and Back works.
5. Also note: is the first frame from 0 before the resume seek? Does audio play (you can't hear it, but check the logs for audio errors)? Do `vega device` logs show w3cmedia errors?
6. If playback doesn't work, compare against Amazon's `vega-video-sample` (https://github.com/AmazonAppDev/vega-video-sample) and the Vega media troubleshooting doc (`react_native_for_vega_media_troubleshooting.md`). Fixes inside `PlayerController.ts` / `PlayerScreen.tsx` are allowed if needed to make playback work; keep them minimal, add a test for each, and list them in the report.
7. Optional: log the device-profile probe results (`getDeviceCapabilities()` from `src/playback/deviceProfile.ts`) once on the simulator and include them in the report. Don't commit the logging.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.

## Rules
- Source files: `src/navigation/RootNavigator.tsx`, `src/screens/DetailsScreen.tsx`, and only if the check needs a fix, `src/playback/PlayerController.ts` / `src/screens/PlayerScreen.tsx`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed (and any player fixes, with why)
- what the simulator check showed for each item in step 4, with the scratchpad paths of the screenshots
- which movies direct played and which needed transcoding (titles are fine; no server address)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved, and what still needs the real Fire TV (screensaver, the remote's play/pause key, captions)
