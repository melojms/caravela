# Task 9c: HLS playback check on the Fire TV

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-09c (branch `task/09c-device-check`, from `main`).
Background: read docs/HANDOFF.md first, especially "How we work", "Signing in during a check", "Shared Fire TV", "Screenshot (Fire TV)" and "Remote input". Then read README.md "Shaka Player (not included)". Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Shaka 4.16.13 (Amazon's Vega build), Jellyfin 12.2.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**What's on `main`:**
- 9a: the resolver returns HLS sessions (`mode: 'hls'`, DirectStream or Transcode) from the server's `TranscodingUrl`. mkv is out of direct play, so the server remuxes it. The bitrate cap is `DEFAULT_MAX_BITRATE` (100 Mbit/s) in `deviceProfile.ts`.
- 9b: `src/playback/shaka.ts` (the Shaka adapter, `HLS_SEQUENCE_MODE = false`) and HLS mode in `PlayerController.ts`.
- Neither has run on a device yet. That's this task.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (it only copies files).
- `npm run build:release`. Use `build/armv7-release/caravela_armv7.vpkg` on the **Fire TV** (`192.168.50.124:5555`); playback checks don't work on the simulator.
- Read `vega_cli_commands_reference.md` (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`) before using any Vega CLI command not already listed in HANDOFF.md.
- Run every install / launch / input / screenshot flow inside `flock /tmp/caravela-device.lock -c '…'`, and hold the lock for a whole flow.
- The install wipes storage. Add the server (the address in docs/LOCAL.md) and sign in as `melojms` with **Quick Connect**:
  - Print the code on its own line as `QUICK CONNECT CODE: <code>` and keep polling. The user approves it.
  - If a code expires, fetch a new one.
  - **Never use the password.**
- After that, reinstall with `vega device install-app` (it upgrades in place and keeps the sign-in), not `run-app`.
- Screenshots stay in your scratchpad, never in the repo; downscale them before viewing.
- Don't print access tokens or full stream URLs (they carry `ApiKey`) in your output. Redact them as `ApiKey=…`.

## Checks (screenshot each, and read the app's logs)
1. **DirectStream (remux):** pick an **mkv** movie from Home (Continue watching, or a Recently added row).
   - Play starts, with no stall in the first 2 minutes.
   - Select and play/pause toggle pause; the paused overlay shows the times.
   - Back leaves the player.
   - **Resume** on that movie lands near the saved position (Jellyfin only saves one after 5% played; play past 5% first if needed).
   - For a resume, check that the stream starts at the position rather than at 0 and then seeking.
2. **Transcode:** set `DEFAULT_MAX_BITRATE` in `deviceProfile.ts` to `2_000_000` **temporarily** (never commit this), rebuild, and install with `install-app`.
   - Play an h264/hevc movie with a bitrate well above 2 Mbit/s.
   - It should transcode (the server's PlaybackInfo response has `SupportsTranscoding` and a `TranscodingUrl` with `TranscodeReasons`).
   - Same checks as step 1.
   - Then **revert** the change, with `git diff` clean.
3. **TS against fMP4:** find out which segment container the server used in steps 1 and 2 (the `master.m3u8` / `main.m3u8` paths or the `SegmentContainer` parameter in the URL).
   - If a TS stream stalls or the picture/audio jumps, try `HLS_SEQUENCE_MODE = true` and report the difference.
   - Only commit a change to `HLS_SEQUENCE_MODE` (with the reason in the comment) if it clearly fixes a stall.
4. **Transcode ends on stop:** after Back from a transcode, tell the orchestrating session (print `CHECK DASHBOARD NOW` on its own line).
   - The user looks at Dashboard → Active devices.
   - Wait about 60 s for their reply, which comes as a follow-up prompt. If none arrives, carry on and note it.
5. **Errors:** play an item while the TV can't reach the server (or point at a stream that 404s, if that's easier), and check that the player shows a message with Retry instead of a stuck spinner. Skip this if it can't be done without touching the network; say so.
6. **Direct play still works:** an mp4 movie plays in URL mode as before.

## Fixes
- If something fails, find the cause from the logs. Fix it if it's in `src/playback/shaka.ts`, `src/playback/PlayerController.ts` or `src/screens/PlayerScreen.tsx`, with tests, and check again.
- Keep any fix to those files. Anything bigger, stop and report what you found.

## Rules
- Commit only real fixes (no bitrate change, no logs) to the branch, with no Co-Authored-By or Claude-Session trailers. Run `npm run lint`, `npx tsc --noEmit` and `npm test` before each commit.
- Nothing from `src/vendor/` in a commit.
- Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- for each check: what happened, with the scratchpad screenshot paths
- the segment container used and the sequence-mode decision
- the Shaka errors or warnings seen in the logs
- any fixes, with the test count and lint result
- edge cases and suggested tests
- anything unresolved
