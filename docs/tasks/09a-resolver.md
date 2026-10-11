# Task 9a: HLS sessions in the resolver, mkv out of direct play, bitrate cap

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-09a (branch `task/09a-resolver`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" steps 1, 2 and 4) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code): `playback/jellyfin/src/main/kotlin/mediastream/JellyfinMediaStreamResolver.kt` (play method choice), `app/src/main/java/org/jellyfin/androidtv/ui/playback/PlaybackManager.kt`, and how its SDK's `api.createUrl(…, ignorePathParameters = true)` builds the final URL (does it add the token?).

**What's already on `main`** (use it):
- `src/playback/types.ts`: `PlaybackSession` now has `mode: 'url' | 'hls'` and an optional `maxStreamingBitrate`. `needs-transcode` now means "can't direct play and the server gave no usable `TranscodingUrl`". Don't change this file; if you think it needs a change, say so in the report.
- `src/playback/resolver.ts`: direct play only; anything else → `needs-transcode`.
- `src/playback/deviceProfile.ts`: `buildDeviceProfile({maxStreamingBitrate})`, `DEFAULT_MAX_BITRATE` (100 Mbit/s), HLS transcoding profiles (TS and fMP4) already sent.

**9b runs in parallel** and changes `PlayerController.ts` and adds the Shaka adapter. Don't touch `PlayerController.ts`, `PlayerScreen.tsx` or anything under `src/vendor/`.

## Setup
- Run `npm ci` first. The worktree has no `node_modules`.
- You don't need the Shaka build (`src/vendor/shaka/`) for this task.

## Scope (only this)
1. **`src/playback/deviceProfile.ts`**: remove `mkv` from `DIRECT_PLAY_CONTAINERS` (decided: on the Fire TV, URL mode can't seek in mkv, `Seek failed. Internal error 0`, code 50004; the server remuxes it to HLS instead). Update the comment above the table to say why.
2. **`src/playback/resolver.ts`**:
   - Direct play stays first and unchanged (`mode: 'url'`).
   - Otherwise, like androidtv's `JellyfinMediaStreamResolver`: `SupportsDirectStream` with a `TranscodingUrl` → `PlayMethod.DirectStream`; else `SupportsTranscoding` with a `TranscodingUrl` → `PlayMethod.Transcode`. Both get `mode: 'hls'` and `url = api.basePath + TranscodingUrl`, used as the server returns it (the 12.2 OpenAPI spec has no HLS paths). Only accept `TranscodingSubProtocol` `hls`; anything else → `needs-transcode`.
   - The token: check whether the server's `TranscodingUrl` already carries `ApiKey`/`api_key` (look at the 12.2 server behaviour, androidtv's `createUrl` and jellyfin-web). If it doesn't, append `api_key` the way `directPlayUrl` does, without duplicating it.
   - `needs-transcode` keeps the same reason; reword `NEEDS_TRANSCODE_MESSAGE` to say the server can't stream this file (it no longer means "Caravela can't play it yet").
   - **Bitrate cap:** `PlaybackRequest.maxStreamingBitrate` defaults to `DEFAULT_MAX_BITRATE`. Use the same value for the device profile (`buildDeviceProfile({maxStreamingBitrate})`, unless `deviceProfile` is passed) and PlaybackInfo's `MaxStreamingBitrate`, and put it on the session as `maxStreamingBitrate` (9b caps Shaka's ABR with it). The settings screen for it comes in task 14; nothing in the UI changes now.
   - Audio/subtitle indexes and `durationMs` are filled the same way as for direct play.
3. No other source files.

## Tests
- `test/playback/resolver.spec.ts` decision table: direct play wins when supported; DirectStream (`SupportsDirectStream` + URL); Transcode (`SupportsTranscoding` only); no `TranscodingUrl` → `needs-transcode`; non-`hls` sub-protocol → `needs-transcode`; URL joined with `basePath` (with and without a path prefix on the server); `api_key` added once / not duplicated; default and custom `maxStreamingBitrate` reach both the profile and the request, and land on the session.
- `test/playback/deviceProfile.spec.ts`: no `mkv` direct play profile; mp4/webm/ts unchanged.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No device check: 9c checks 9a and 9b together on the Fire TV.

## Rules
- Source files: `src/playback/resolver.ts`, `src/playback/deviceProfile.ts`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the resolver's decision order
- whether `TranscodingUrl` already has the token on 12.2, and how you know
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
