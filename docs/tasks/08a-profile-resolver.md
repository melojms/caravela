# Task 8a: device profile and playback resolver

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-08a (branch `task/08a-profile-resolver`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" steps 1, 2 and 4) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin server 12.0+ (the test server runs 12.2).
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful files:
- `app/src/main/java/org/jellyfin/androidtv/util/profile/deviceProfile.kt` (direct play, transcoding, codec and subtitle profiles), `KnownDefects.kt`, `codec/*.kt`
- `app/src/main/java/org/jellyfin/androidtv/ui/playback/PlaybackManager.kt` (the PlaybackInfo request and how a media source is picked)
- `playback/jellyfin/src/main/kotlin/mediastream/JellyfinMediaStreamResolver.kt` (direct play vs direct stream vs transcode, the static stream URL)

**Another agent runs at the same time:**
- 8b (playback reporting) in `../caravela-wt/task-08b` adds `src/playback/reporting.ts`. **Don't touch it.**
- The shared types are already on `main` in `src/playback/types.ts` (`PlaybackSession`, `PlaybackResolution`, `PlaybackUnavailableReason`). **Don't change that file**; if a type doesn't fit, say so in the report.
- 8c (later) builds `PlayerController.ts` and `PlayerScreen.tsx` on top of your resolver and the W3C media package you add.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Use Context7 for the `@jellyfin/sdk` docs (`getMediaInfoApi`, `getPostedPlaybackInfo`, `PlaybackInfoDto`, `DeviceProfile`). Check the generated types in `node_modules/@jellyfin/sdk/lib/generated-client/models/` for the exact 1.0.0 field names.
- Vega docs (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`): `react_native_for_vega_media_player.md`, `react_native_for_vega_media_player_architecture.md`, and the w3cmedia API reference (https://developer.amazon.com/docs/vega-api/latest/README.amazon-devices_react-native-w3cmedia.html) for how `MediaSource.isTypeSupported` is exposed and which codec strings and HDR parameters Vega accepts. The `amazon-devices-vega-media-player` skill has the same material.

## Scope (only this)
1. **Add the W3C media package:** `@amazon-devices/react-native-w3cmedia@~2.3.4-rn-83` (the RN 0.83 build; the `~4.0` in PLAN.md doesn't exist on npm). Check whether Babel needs the automatic JSX runtime change the Vega doc mentions, given our `@react-native/babel-preset`; only change `babel.config.js` if the build or tests need it. The media `wants` in `manifest.toml` are already there; keep any `[[needs.module]]` the build adds.
2. **Jest mock for the package** (e.g. `test/__mocks__/react-native-w3cmedia.ts` wired with `moduleNameMapper` in `jest.config.json`, or a `jest.mock` in `test/setup.tsx`): enough for `MediaSource.isTypeSupported` now. 8c will extend it with `VideoPlayer` and `KeplerVideoSurfaceView`, so make it easy to add to.
3. **`src/playback/deviceProfile.ts`** (new), porting `deviceProfile.kt`:
   - `buildDeviceProfile(options?)` → `DeviceProfile`. `options` includes `isTypeSupported` (defaults to the w3cmedia `MediaSource.isTypeSupported`, injectable for tests) and `maxStreamingBitrate`. Memoize the default profile, so the probes run once per app run.
   - Probe video h264, hevc (8-bit and 10-bit), vp9 and av1, HDR10 / HLG / Dolby Vision if Vega's `isTypeSupported` can express them (if it can't, report SDR only and say so in the report), and audio aac, mp3, ac3, eac3, opus, flac, dts, truehd. Keep the probe strings in one table, so the TV and the simulator can be compared later.
   - Direct play profiles: mp4/m4v, mkv, webm (and whatever else androidtv lists that Vega's URL mode plays) with the probed codecs.
   - Transcoding profiles, same as androidtv: HLS with fMP4 and with TS, video h264 (+ hevc when supported), audio aac/ac3/eac3; `Context: Streaming`, `Protocol: hls`. Playing HLS is task 9, but the server should already return a `TranscodingUrl`.
   - Codec profiles / conditions androidtv applies that still make sense (h264 profiles and level, hevc 10-bit only when probed, max audio channels).
   - Subtitle profiles: vtt / srt / subrip / ttml → `External`; ass / ssa / pgs / pgssub / dvdsub / dvbsub → `Encode` (burned in by the server).
   - Name the profile `Caravela`.
4. **`src/playback/resolver.ts`** (new):
   - `resolvePlayback(api, request)` → `Promise<PlaybackResolution>`. `request`: `itemId`, `userId`, `startMs`, optional `mediaSourceId`, `audioStreamIndex`, `subtitleStreamIndex`, `maxStreamingBitrate`, `deviceProfile` (defaults to `buildDeviceProfile()`).
   - Call `getMediaInfoApi(api).getPostedPlaybackInfo` with the fields from PLAN.md step 4: mediaSourceId, startTimeTicks (`msToTicks` from `src/api/itemInfo.ts`; reuse it and `ticksToMs`, don't redefine them), deviceProfile, enableDirectPlay / enableDirectStream / enableTranscoding = true, audio/subtitle stream index, allowVideoStreamCopy / allowAudioStreamCopy = true, alwaysBurnInSubtitleWhenTranscoding, autoOpenLiveStream as androidtv sets it.
   - Pick the media source: the requested `mediaSourceId`, else the first.
   - `ErrorCode` set, or no media source → `unavailable` / `no-media-source` with a readable message for each `PlaybackErrorCode` (NotAllowed, NoCompatibleStream, RateLimitExceeded).
   - `SupportsDirectPlay` → `play` with `playMethod: DirectPlay` and the static URL `${api.basePath}/Videos/{itemId}/stream?static=true&mediaSourceId=…&deviceId=…&api_key=…` plus `Tag` (the source's `ETag`) and `LiveStreamId` when present, as `JellyfinMediaStreamResolver.kt` builds it. Use `api_key` because URL mode can't send headers. Fill `playSessionId`, `mediaSourceId`, `startMs`, the stream indexes the server picked (`DefaultAudioStreamIndex` / `DefaultSubtitleStreamIndex` when none were asked for) and `durationMs` from `RunTimeTicks`.
   - Otherwise (direct stream / transcode) → `unavailable` / `needs-transcode`, message "This file needs transcoding, which Caravela can't play yet." Task 9 replaces this.
   - The device ID: `api.deviceInfo.id` (check the 1.0.0 `Api` shape).

## Tests
- `test/playback/deviceProfile.spec.ts`: with a mocked `isTypeSupported`, codecs appear in direct play only when supported; hevc 10-bit gating; HDR when expressible; the transcoding profiles (HLS fMP4 + TS, codec lists); every subtitle format's method; the bitrate option; memoization of the default profile.
- `test/playback/resolver.spec.ts` (mock `getMediaInfoApi` like `test/api/home.spec.ts` mocks the SDK): the request body; direct play → URL with every query parameter (encoded) and the session fields; picking the requested media source; server-chosen stream indexes; direct stream and transcode → `needs-transcode`; each `ErrorCode` and an empty `MediaSources` → `no-media-source`; a network error rejects (the caller shows it).

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, and `npm run build:release` (the new native package must build; keep the `[[needs.module]]` entries it adds to `manifest.toml`).
- No simulator check needed: nothing calls this yet. If you can, log the probe results once on the simulator and include them in the report (optional).

## Rules
- Source files: `src/playback/deviceProfile.ts`, `src/playback/resolver.ts`, plus `package.json`, `package-lock.json`, `manifest.toml`, `jest.config.json` / test setup and `babel.config.js` only as the package needs. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported API (signatures) 8c will use
- how the w3cmedia package is mocked in Jest, and whether Babel needed changes
- what you took from androidtv (and anything deliberately different), and the probe table
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
