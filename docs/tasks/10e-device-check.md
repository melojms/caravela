# Task 10e: subtitles and audio tracks on the Fire TV

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10e (branch `task/10e-device-check`, from `main`).
Background: read docs/HANDOFF.md first, especially "How we work", "Signing in during a check", "Shared Fire TV", "Screenshot (Fire TV)" and "Remote input". Then read docs/tasks/10a–10d (what was built). Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Shaka 4.16.13 (Amazon's Vega build), Jellyfin 12.2.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**What's on `main`:**
- The app draws subtitles itself (`src/playback/subtitles.ts`, `src/components/SubtitleView.tsx`, `src/screens/PlayerSubtitles.tsx`): text subtitles are fetched from the server as WebVTT and drawn over the video; the outline is a black `textShadow` (untested on Vega).
- ASS/SSA/PGS/DVD subtitles are burned in by the server (re-resolve to a transcode).
- The paused overlay has Play / Subtitles / Audio buttons opening `TrackPicker`. Text ↔ text / None switches are client-side; audio changes and switches to or from a burned-in subtitle stop the session and re-resolve at the paused position.
- None of this has run on the Fire TV yet. That's this task.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, then `npm run build:release`. Use `build/armv7-release/caravela_armv7.vpkg` on the **Fire TV** (`192.168.50.124:5555`).
- Read `vega_cli_commands_reference.md` (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`) before using any Vega CLI command not already listed in HANDOFF.md.
- Run every install / launch / input / screenshot flow inside `flock /tmp/caravela-device.lock -c '…'`, and hold the lock for a whole flow.
- The install wipes storage. Add the server (the address in docs/LOCAL.md in the main checkout) and sign in as **`demo` with an empty password** on the Password screen. If `demo` can't see the movies below, fall back to `melojms` with Quick Connect (print `QUICK CONNECT CODE: <code>` on its own line, keep polling, new code if one expires; **never use `melojms`'s password**). After that, reinstall with `vega device install-app` (keeps the sign-in), not `run-app`.
- For server-side checks use curl with your own `demo` token (sign in with `AuthenticateUserByName`, empty password; log the session out at the end). `GET /Sessions` shows the app's `PlayState` (`AudioStreamIndex`, `SubtitleStreamIndex`, `PlayMethod`) and `TranscodingInfo`.
- Screenshots stay in your scratchpad, never in the repo; downscale them before viewing. Don't print tokens or full stream/subtitle URLs (they carry `api_key`/`ApiKey`); redact as `api_key=…`.

## Test items
- **The Age of Adaline**: 2 audio tracks (one is Commentary), an external SRT (Portuguese) and DVD subtitles (burned in). In Home → "Recently added in Movies".
- **Ad Astra**: 2 audio, 3 external SRT.
- If there's a movie with **ASS** or **PGS** subtitles, or an **embedded subrip** in an mkv, use it too (search with curl). Note which you found.

## Checks (screenshot each; read the app's logs)
1. **Text subtitle in direct play / remux:** pick an SRT track. Subtitles draw at the bottom, readable, with a visible outline/shadow on bright scenes. Timing matches speech (compare with jellyfin-web if unsure). `/Sessions` shows the new `SubtitleStreamIndex` within ~3 s, without a new play session.
2. **Text ↔ text and None:** switch to another SRT, then None: no reload, the drawn text changes or disappears, the index updates in `/Sessions`.
3. **After a seek / resume (HLS):** for an mkv (DirectStream over HLS) or a transcode, leave mid-movie, Resume, then turn on an SRT: the cues must match the speech at the resumed position (Shaka sequence mode might restart `currentTime` near 0; if the text is offset by the resume position, say so and measure the offset).
4. **Burn-in:** pick the DVD (or PGS/ASS) subtitle: spinner, reload at the paused position, `/Sessions` shows Transcode with the subtitle burned in (`TranscodingInfo`), and the subtitle is visible in the picture. Then switch back to SRT or None: reloads again, and the server stops burning (DirectPlay/DirectStream again when possible). The old transcode is gone from `/Sessions`.
5. **Audio:** switch to Commentary: reload at the position, `/Sessions` shows the new `AudioStreamIndex` and the play method used. Note whether direct play stays direct play. The current subtitle choice survives the switch.
6. **Overlay and picker on the remote:** Play focused when paused; OK on Play resumes; OK on a button doesn't toggle pause; the remote's play/pause key works with the overlay up; Back closes only the picker, focus returns to the button; Back from the overlay leaves the player. Long track labels fit or truncate cleanly.
7. **Exit:** Back after switches ends the session (`/Sessions` shows nothing playing), and Details/Home show the resume point.

## Fixes
- If something fails, find the cause from the logs. Fix it if it's in `src/playback/subtitles.ts`, `src/components/SubtitleView.tsx`, `src/screens/PlayerSubtitles.tsx`, `src/screens/PlayerScreen.tsx` or `src/playback/PlayerController.ts`, with tests, and check again. The subtitle time offset in check 3, if any, counts (fix it where the position is read, with a test).
- Anything bigger, or in the resolver/device profile, stop and report what you found.

## Rules
- Commit only real fixes (no logs, no debug code) to the branch, with no Co-Authored-By or Claude-Session trailers. Run `npm run lint`, `npx tsc --noEmit` and `npm test` before each commit.
- Nothing from `src/vendor/` in a commit.
- Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- for each check: what happened, with the scratchpad screenshot paths
- which subtitle formats you tested (SRT, DVD, PGS, ASS, embedded) and the play method for each
- how the outline looks on the TV
- whether `demo` worked for sign-in
- any fixes, with the test count and lint result
