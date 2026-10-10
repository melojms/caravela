# Plan: Jellyfin-compatible Vega OS client (movies + TV shows)

## Context
- **Goal:** a Vega OS (Fire TV) client for a Jellyfin server that matches jellyfin-androidtv for **movies and TV shows**.
- **Out of scope:** Live TV, music, photos, the screensaver, launcher channels / Watch Next, external players, SyncPlay and refresh-rate switching.
- **Name: Caravela** (after the caravela-portuguesa). The package ID is still to be decided. The icon is chosen from the concepts at https://claude.ai/artifact/WS7qYYNcWbYr5NRuUoXGaA. "Works with Jellyfin" wording in the description is fine; the logo and wordmark are not.
- **License:** the reference app is GPL-2.0.
  - We rewrite it in TypeScript rather than copying code, but the logic (device profile, playback flow) is closely derived from it.
  - **Decided: GPL-2.0.** Publishing on the Appstore later requires a public source repo.
- **Environment:**
  - `jellyfin-vega/` contains only `.eslintrc`, `.prettierrc` and `.gitignore`, and is not a git repo yet.
  - Vega SDK 0.24 and CLI 1.4.4 are installed, which means **RN 0.83 / React 19**.
  - Node is v24 (≥ 22.14 is required).
- **Target server:** Jellyfin **10.11+**, the same minimum as the Android TV app (it uses SDK 1.8.12).

## Architecture
- **Stack:**
  - React Native for Vega 0.83 + TypeScript.
  - `@amazon-devices/react-navigation` (stack + drawer).
  - `@amazon-devices/kepler-ui-components` Carousel for rows.
  - TVFocusGuideView / FocusManager for D-pad focus.
- **API:** `@jellyfin/sdk` (the official TypeScript SDK; version to match the 10.11 OpenAPI). It gives typed `getItemsApi`, `getMediaInfoApi` and the other endpoints, mirroring the Kotlin calls the Android app uses.
- **State and data:** TanStack Query for server data, a small Zustand store for session and settings, and persistent storage for servers, users and tokens. Which storage package Vega supports still needs verifying.
- **Playback:** `@amazon-devices/react-native-w3cmedia` ~4.0 (VideoPlayer + KeplerVideoSurfaceView + KeplerCaptionsView).
  - **Direct play** (mp4/mkv/webm static stream): URL mode.
  - **Transcode / direct stream** (`master.m3u8`, fMP4 segments): **Shaka Player 4.16.13-r1.2** (Vega port) in MSE mode.
- **Folder layout:** `src/api` (sdk client, queries), `src/auth`, `src/navigation`, `src/screens/*`, `src/components` (Card, Row, Grid, FocusableButton), `src/playback` (profile, resolver, controller, reporting, segments, trickplay), `src/settings`, `src/theme`.

### Feature mapping (Android app → Vega)
- **Auth** (`auth/repository/*`):
  - Manual server address with candidate probing (`getPublicSystemInfo`).
  - Public user list, password login, **Quick Connect**, multi-server and multi-user, auto-login (last / specific user).
  - **UDP discovery is deferred**: RN on Vega has no UDP socket API, so it would need a Turbo Module.
- **Home** (`ui/home/*`):
  - Rows: Continue Watching (`getResumeItems`, Video), Next Up (`getNextUp`), Latest per library (`getLatestMedia`), My Media (`getUserViews`).
  - Row order is read from the server DisplayPreferences `usersettings` (`homesection0..9`), so it stays shared with jellyfin-web.
- **Library** (`ui/browsing/*`):
  - Movies and Series grids (`getItems`) with sort/order, favorites and unwatched filters, letter jump (`nameStartsWith`), genres and collections.
  - Per-library display preferences are stored server-side.
- **Details** (`FullDetailsFragment`):
  - Movie, Series (seasons → episodes via `getSeasons` / `getEpisodes`) and Episode pages.
  - Content: overview, info row, cast, similar items (`getSimilarItems`), chapters, specials and local trailers.
  - Actions: play / resume / restart, mark played, favorite, plus version / audio / subtitle pickers.
- **Search:** `getItems(searchTerm)` limited to movies, series, episodes, collections and people. Voice search is deferred.
- **Settings subset:**
  - Account and server switching.
  - Home sections.
  - Playback: max bitrate, resume pre-roll, skip lengths, next-up behavior, media-segment actions, subtitle styling and default language, "burn subs when transcoding".
  - About / licenses.

### Playback design (core risk area)
1. **Device profile** (`src/playback/deviceProfile.ts`, porting `util/profile/deviceProfile.kt`):
   - Build it at runtime from **W3C Media Capabilities / `MediaSource.isTypeSupported`**, which replaces MediaCodec probing. Probe h264/hevc/vp9/av1, HDR10/HLG, and aac/ac3/eac3/opus/flac.
   - Transcoding profile: HLS, fMP4, h264/hevc + aac/ac3.
   - **Subtitles:**
     - VTT/SRT/TTML: External (rendered natively through `addTextTrack`).
     - ASS/SSA/PGS/DVD: **Encode** (burned in by the server), because Vega has no libass/PGS renderer.
2. **Resolve** (`resolver.ts`): `getPostedPlaybackInfo` (profile, maxStreamingBitrate, chosen audio/subtitle index, start ticks), then pick direct play URL, direct-stream HLS or transcode HLS. Keep `PlaySessionId`.
3. **Player controller** (`PlayerController.ts`):
   - One wrapper over VideoPlayer that switches between URL mode and Shaka mode.
   - Follow the init/teardown order from the Vega docs: initialize, then attach listeners, then set the surface; on stop, unload Shaka before deinitializing.
4. **Track switching:**
   - Subtitles: change the external track client-side when possible.
   - Audio changes, and switching to a burned-in subtitle, re-request PlaybackInfo with the new indexes and reload at the current position. The Android app does the same when transcoding.
   - When not direct playing, call `stopEncodingProcess(deviceId, playSessionId)` before re-requesting (Android's `changeVideoStream`).
   - PlaybackInfo request (mirrors Android `PlaybackManager`): mediaSourceId, startTimeTicks, deviceProfile, enableDirectPlay/Stream, audio/subtitleStreamIndex, allowVideo/AudioStreamCopy=true, alwaysBurnInSubtitleWhenTranscoding.
   - Stream URL: direct play uses `/Videos/{id}/stream?static=true&mediaSourceId&tag`; direct stream and transcode use the server's `transcodingUrl`.
   - Transcoding profiles: offer both HLS TS and fMP4, same as Android. Which one Shaka handles better is decided on the device (`hls.sequenceMode` for TS if it stalls).
5. **Reporting** (`reporting.ts`, porting `PlaySessionService.kt`):
   - `reportPlaybackStart`, `reportPlaybackProgress` every 3 s while playing and every 15 s while paused (same as Android), `reportPlaybackStopped`.
   - Each report sends: itemId, mediaSourceId, positionTicks (ms × 10000), playSessionId, playMethod, audio/subtitle stream indexes, isPaused, canSeek.
   - Call `stopEncodingProcess` on exit.
6. **On-screen controls:**
   - Play/pause, seek bar with **trickplay** tiles, chapters, skip back/forward.
   - Audio, subtitle, quality and speed menus; zoom (fit / crop / stretch).
   - Handle remote media keys through Vega Media Controls.
7. **Media segments** (`getItemSegments`): Skip / Ask-to-skip / Nothing for each segment type. Intro and Outro default to ask-to-skip, with a "Skip intro" button overlay.
8. **Next up:**
   - Episode queue (next episodes of the series).
   - Up-next overlay near the end (extended / minimal / off, with a countdown; default 7 s).
   - "Still watching?" prompt.
9. **Resume:** start at `playbackPositionTicks` minus the pre-roll offset, with a Resume / Start-over choice.

## Delivery: small tasks (each ≤3 files where possible, one PR each)
1. Scaffold the app from the Vega template (RN 0.83).
   - Includes `git init`, the LICENSE, `manifest.toml` with the new name, package ID and icon, and the media wants/privileges.
   - Builds and runs on the device.
2. Jellyfin SDK client, plus a storage layer for servers, users and tokens.
3. Auth screens: server add, user pick, password login, Quick Connect, auto-login.
4. Navigation shell (drawer: Home / Movies / Shows / Search / Settings), theme tokens, focusable Card/Row/Grid components.
5. Home rows.
6. Library grids with sort, filter and letter jump.
7. Details screens (movie / series / season / episode).
8. Playback MVP: device profile, resolver, URL-mode direct play, reporting, resume.
9. Shaka HLS for transcoding/direct stream, plus bitrate cap.
10. Subtitles (external VTT/SRT, burn-in fallback, styling) and audio track switching.
11. Player overlay: trickplay, chapters, speed, zoom.
12. Media segments skip + next-up overlay + still-watching.
13. Search.
14. Settings screens (server-backed display prefs + local).
15. Polish: i18n scaffold (English first), performance pass (Vega KPIs), optional websocket remote control and Content Launcher / Media Controls integration.

## Verification
- **Unit tests (Jest):**
  - Device-profile builder with mocked `isTypeSupported`.
  - Resolver decision table: direct play, direct stream, transcode, and burn-in for ASS/PGS.
  - Ticks/ms conversion.
  - Reporting cadence.
  - Next-up and segment-skip logic.
- **Test server:** a local Jellyfin 10.11 in Docker with a test library: h264/aac mp4, hevc 10-bit mkv, an AV1 file, ac3/eac3/dts audio, SRT / ASS / PGS subtitles, files with intro segments and trickplay, and a multi-season series.
- **On-device:**
  - Build and install with the Vega CLI, after reading the CLI reference and confirming the commands.
  - Test on a **physical Fire TV**, because captions don't render on the simulator.
  - Check the server dashboard shows the correct play method (direct play vs transcode) and that progress and resume sync with jellyfin-web.
- **Performance:** run the Vega KPI checks (UI fluidity on grids, time to first frame) before release.

## Decisions
- **Test server:** https://jellyfin.example.lan, using a dedicated test user (no main-account password in chat).
- **Device:** physical Fire TV running Vega, connected over the network on port 5555.
- **Deferred:** UDP server discovery (you type the server address), websocket remote control.
- **Language:** English only to start.

- **Package ID:** `com.melojms.caravela`.
- **Icon:** concept B ("Sail") from the artifact.
- **Test user:** `melojms` (log in with Quick Connect, no password in chat).

## Unresolved questions
- None yet.
