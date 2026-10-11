# Task 10a: audio and subtitle tracks from PlaybackInfo, indexes in the reports

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10a-tracks (branch `task/10a-tracks`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" steps 1, 2, 4 and 5) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful: `app/src/main/java/org/jellyfin/androidtv/ui/playback/` (how it lists audio/subtitle streams and labels them) and `ui/playback/overlay/action/ClosedCaptionsAction.kt`. For server behaviour, check the Jellyfin server source on GitHub (`MediaInfoController` / `MediaInfoHelper.SetDeviceSpecificSubtitleInfo`, `StreamBuilder`, `SubtitleController`) and jellyfin-web.

## The task 10 approach (approved)
- **Subtitles are drawn by the app, not by Vega's `KeplerCaptionsView`** (it only renders when the TV-wide captions setting is on, and can't be styled). Text subtitles (SRT, VTT, TTML, embedded subrip, sidecar files) are fetched from the server **as WebVTT** and drawn in a React Native `<Text>`; switching between them is client-side. 10b writes the fetch/parse/draw part.
- ASS/SSA/PGS/DVD/DVB subtitles are **burned in** by the server: picking one, or leaving one, re-requests PlaybackInfo at the current position with the new `SubtitleStreamIndex`.
- **Audio switches always re-request PlaybackInfo** with the new `AudioStreamIndex` (the server decides whether it can still direct play).
- A switch that re-resolves ends the old session with `reportPlaybackStopped` first (SDK 1.0.0 and the 12.2 server have no `stopEncodingProcess`; task 9 showed stopped ends the transcode). 10d does the switching in `PlayerScreen`.
- Because Shaka no longer handles subtitles, the HLS manifest should not carry them.

**What's already on `main`** (use it, don't change it): `src/playback/types.ts` has `MediaTrack`, `SubtitleTrack` (`delivery: 'external' | 'burn-in'`, `vttUrl?`), `PlaybackSession.audioTracks?` / `subtitleTracks?`, and `PlaybackSnapshot.audioStreamIndex?` / `subtitleStreamIndex?`. If you think the types need a change, say so in the report instead of editing them.

**Running in parallel:** 10b (`src/playback/subtitles.ts`, `src/components/SubtitleView.tsx`) and 10c (`src/components/TrackPicker.tsx`). Don't touch those files, `PlayerController.ts`, `PlayerScreen.tsx` or anything under `src/vendor/`.

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`tsc` needs the vendored Shaka files; Jest doesn't).

## Scope (only this)
1. **`src/playback/resolver.ts`**: fill `audioTracks` and `subtitleTracks` on the session from the chosen source's `MediaStreams`, in server order.
   - Audio streams → `MediaTrack`: `index` = `Index`; `label` = `DisplayTitle`, else the language, else a numbered fallback (match androidtv's fallback); `language`; `isDefault`.
   - Subtitle streams → `SubtitleTrack`:
     - `external` when the server's `DeliveryMethod` for that stream is `External` (check in the server source that PlaybackInfo fills `DeliveryMethod` for **every** subtitle stream, not only the selected one, and say what you found). Anything else (`Encode`, `Embed`, `Hls`, missing) → `burn-in`.
     - `vttUrl` for `external` tracks: always WebVTT, even when the stream is SRT/TTML, so 10b only parses one format. Build it as the server's subtitle stream endpoint with a `.vtt` format (e.g. `/Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/0/Stream.vtt`; confirm the exact path and that the server converts to VTT on 12.2) on `basePath`, with `api_key` added the same way as `directPlayUrl` (the request has no headers). Don't reuse `DeliveryUrl` blindly: it carries the profile's format (`srt`, …). If you find a better server-provided URL, explain why in the report.
     - Sidecar (`IsExternal`) text files are tracks too.
   - Keep the existing `audioStreamIndex`/`subtitleStreamIndex` logic (request value, else the source's default). A default of `-1` (subtitles off) must reach the session as `-1`.
   - No other behaviour change.
2. **`src/playback/deviceProfile.ts`**: send `EnableSubtitlesInManifest: false` (the app draws subtitles; Shaka shouldn't load them). Update the comment. Leave the subtitle profiles as they are unless the server check above shows they're wrong.
3. **`src/playback/reporting.ts`**: each start/progress/stopped report sends the snapshot's `audioStreamIndex` / `subtitleStreamIndex`, falling back to the session's when the snapshot has none (a client-side subtitle switch changes the snapshot, not the session). Keep the "last good snapshot" fallback working for them.
4. No other source files.

## Tests
- `test/playback/resolver.spec.ts`: audio and subtitle tracks mapped with labels and fallbacks; `external` vs `burn-in` per `DeliveryMethod`; `vttUrl` path, encoding of ids, `api_key` added once, with a server path prefix; sidecar subtitle; no `MediaStreams` → empty arrays; default subtitle `-1` kept; the chosen source's streams are used when several sources exist.
- `test/playback/deviceProfile.spec.ts`: `EnableSubtitlesInManifest` is false on the HLS profiles.
- `test/playback/reporting.spec.ts`: indexes from the snapshot win; session's used when the snapshot has none; a subtitle change between two progress reports shows up in the second; stopped sends the latest indexes; a throwing snapshot falls back to the last indexes.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No device check: 10e checks the whole task on the Fire TV.

## Rules
- Source files: `src/playback/resolver.ts`, `src/playback/deviceProfile.ts`, `src/playback/reporting.ts`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and how tracks are built
- whether PlaybackInfo fills `DeliveryMethod` for every subtitle stream on 12.2, the VTT URL you chose, and how you know
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
