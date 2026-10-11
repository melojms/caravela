# Task 10f-1: 7.1 AAC, stopped for sessions that never started, no black screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10f1 (branch `task/10f1-playback-fixes`, from `main`).
Background: read docs/HANDOFF.md first ("Next: task 10 follow-ups", "How we work", "Shared Fire TV", "Screenshot (Fire TV)", "Remote input"), then docs/tasks/10e-device-check.md. Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Shaka 4.16.13 (Amazon's Vega build), `@jellyfin/sdk` 1.0.0, Jellyfin 12.2.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app** where it applies: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only; `app/src/main/java/org/jellyfin/androidtv/util/profile/` for audio channel limits, `ui/playback/` for how it handles a player that never starts).

## What 10e found
- **The Age of Adaline doesn't play.** Our profile allows 8 channels for every codec (`deviceProfile.ts`, "Audio channels" `CodecType.VideoAudio` condition), so the server copies the movie's **7.1 AAC** track into the stream unchanged, and this Fire TV's audio parser fails on it. The screen stays black: no spinner, no error, and play/pause doesn't bring up the overlay.
- **A session that never started leaves its transcode running:** `reporting.ts` `stop()` returns without a request when `start()` never ran, so after Back from the stuck Adaline the transcode stayed in `/Sessions`.

**Running in parallel:** 10f-2 changes `src/components/SubtitleView.tsx`, `src/screens/PlayerSubtitles.tsx` and `src/screens/PlayerScreen.tsx`. Don't touch those. Both tasks use the Fire TV: always hold `flock /tmp/caravela-device.lock` for a whole flow, and **reinstall the app right before each of your flows** (the other agent may have installed its build in between).

## Setup
- `npm ci`, `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, `npm run build:release`; the TV is `192.168.50.124:5555`, package `build/armv7-release/caravela_armv7.vpkg`.
- The app on the TV is signed in as `demo`; `vega device install-app` keeps the sign-in. If you ever need to sign in again: `demo` with an empty password on the Password screen.
- Server checks: curl with your own `demo` token (`AuthenticateUserByName`, empty password; log out at the end). `GET /Sessions` shows `PlayState` and `TranscodingInfo`. Never print tokens or full stream URLs (redact `api_key=…`/`ApiKey=…`).
- Screenshots stay in your scratchpad; downscale before viewing. Reach Adaline from Home → "Recently added in Movies" (no Search yet).

## Scope
1. **Root cause first.** Reproduce Adaline on the TV and read the device logs (what the app's player, Shaka and the media pipeline log; which events fire and which don't). Write down what you see.
2. **`src/playback/deviceProfile.ts`: no 7.1 AAC passthrough.**
   - Find out what this Fire TV can decode: probe with `MediaSource.isTypeSupported` / Media Capabilities with channel counts if Vega honours them (check the Vega W3C Media Capabilities docs via the Amazon Devices MCP), and compare with androidtv's channel rules.
   - Limit AAC to 6 channels (a codec-specific `CodecProfile` for `aac`, and the HLS transcoding profiles' `MaxAudioChannels` if that's what keeps a transcode/remux from copying 7.1 AAC). Keep other codecs as they are unless the probes or androidtv show they need the same; say what you found for E-AC-3/AC-3 7.1.
   - After the fix, Adaline must play: the server should transcode (or downmix) the AAC 7.1 track. Check on the TV and in `/Sessions` (`TranscodeReasons`).
3. **`src/playback/reporting.ts`: stopped for a session that never started.** `stop()` sends `reportPlaybackStopped` even when start never ran (so the server ends the transcode it already began for that `PlaySessionId`), with the start position. Still only once, and still never before an in-flight request. Check that the 12.2 server accepts a stopped for a session it never saw a start for (server source on GitHub or a curl test), and say so.
4. **`src/playback/PlayerController.ts`: no silent black screen.**
   - Prefer a real signal: if step 1 shows an event or error that fires (a `MediaError`, a Shaka error, a `SourceBuffer` error, `stalled`, …) that the controller ignores, turn it into the existing error state (message + Retry).
   - If nothing fires, add a **start watchdog**: before the first `playing`, if the player makes no progress for a fixed time, report an error. Pick the timeout from real start times on the TV (a burned-in ASS/PGS transcode was the slowest start in 10e; measure one) with a wide margin, reset it on any progress (`timeupdate` moving, `progress`, `canplay`), and clear it on `playing`, error and destroy. Use the existing error path so Retry works.
   - A test that the error appears for the Adaline-style case (whatever signal you found), and that a slow but progressing start doesn't trigger it.
5. No other source files.

## Tests
- `test/playback/deviceProfile.spec.ts`: AAC limited to 6 channels (and where), other codecs unchanged unless you changed them.
- `test/playback/reporting.spec.ts`: stopped sent when never started (once, start position, after any in-flight request); the existing "stop twice" cases still hold.
- `test/playback/PlayerController.spec.ts`: the new error path or watchdog (fires, doesn't fire while progressing, cleared on playing/destroy, Retry gets a fresh controller).

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- Fire TV: Adaline plays (screenshot, `/Sessions` reasons); Back from it ends the session; Ad Astra (E-AC-3/AAC remux) and The AI Doc (mp4 direct play) still play; the error/watchdog path shown on the TV if you can trigger it safely (e.g. a temporary build with the AAC cap removed; never commit that).

## Rules
- Source files: `src/playback/deviceProfile.ts`, `src/playback/reporting.ts`, `src/playback/PlayerController.ts`. Tests as listed. Nothing from `src/vendor/`.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers (one commit per fix is fine). Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the root cause of the black screen (logs, which events fired) and what now catches it
- what the TV can decode (AAC/E-AC-3/AC-3 channel counts) and the profile change
- whether the server accepts stopped without start
- screenshots and `/Sessions` results
- the test count and lint result, edge cases and suggested tests, anything unresolved
