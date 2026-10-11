# Task 10b: fetch, parse and draw WebVTT subtitles

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10b-subtitles (branch `task/10b-subtitles`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design") first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Subtitle look: `app/src/main/java/org/jellyfin/androidtv/ui/player/base/PlayerSubtitles.kt`, `ui/settings/screen/customization/subtitle/` (`composable/SubtitleStylePreview.kt`, `presets.kt`) and the defaults in `preference/UserPreferences.kt` (`subtitlesTextColor` white, `subtitlesBackgroundColor` transparent, `subtitleTextStrokeColor` black, `subtitlesTextSize` 24, `subtitlesOffsetPosition` 0.08).

## The task 10 approach (approved)
- **Subtitles are drawn by the app, not by Vega's `KeplerCaptionsView`**: the native view only renders when the TV-wide captions setting is on, has no styling, and doesn't render on the simulator. The server converts every text subtitle (SRT, TTML, embedded subrip, sidecar files) to **WebVTT**; the app fetches it once, parses the cues, and shows the cues active at the player's current time in a `<Text>` over the video.
- ASS/PGS are burned in by the server; that's not this task.
- 10a (parallel) puts `SubtitleTrack.vttUrl` (absolute, with `api_key`) on the session. 10d (later) wires this task's code into `PlayerScreen`, driven by the player's `timeupdate` position. Subtitle style **settings** are task 14: this task only exposes a style type and androidtv's defaults.

**What's already on `main`**: `src/playback/types.ts` has `SubtitleTrack` (`vttUrl?`). Don't change it; say so in the report if it needs a change.

**Running in parallel:** 10a (`resolver.ts`, `deviceProfile.ts`, `reporting.ts`) and 10c (`src/components/TrackPicker.tsx`). Don't touch those, `PlayerController.ts`, `PlayerScreen.tsx` or anything under `src/vendor/`.

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`tsc` needs the vendored Shaka files; Jest doesn't).

## Scope (only this)
1. **`src/playback/subtitles.ts`** (new):
   - A cue type, e.g. `SubtitleCue = {startMs; endMs; lines: SubtitleSpan[][]}` with `SubtitleSpan = {text; italic?; bold?; underline?}`. Pick the exact shape; keep it simple for the view.
   - `parseVtt(text): SubtitleCue[]`, robust to what Jellyfin produces and real-world files: BOM, CRLF/CR, the `WEBVTT` header line and header text, `NOTE`/`STYLE`/`REGION` blocks, optional cue identifiers, `hh:mm:ss.mmm` and `mm:ss.mmm` timestamps, cue settings after the end time (ignored), blank-line separation, multi-line cue text. `<i>`, `<b>`, `<u>` become span flags (nested too); other tags are stripped but their text kept (`<c.yellow>`, `<v Name>`, `<lang>`, `<ruby>`/`<rt>`, inline timestamps `<00:00:01.000>`); entities decoded (`&amp; &lt; &gt; &nbsp; &lrm; &rlm;` and numeric). Malformed cues are skipped, not fatal. Cues come back sorted by start.
   - `activeCues(cues, positionMs): SubtitleCue[]`: all cues where `start <= position < end`, in start order. Overlapping cues must work. It runs on every position update, so avoid a full scan each time on long files (e.g. binary search on start plus a precomputed running max of end times).
   - `useSubtitleCues(vttUrl?: string)`: a hook returning `{cues, loading, error}`; fetches with `fetch` and an `AbortController` (abort on URL change/unmount), no fetch when the URL is undefined; a failed load gives an error, not a throw. Cache parsed cues per URL in memory for the player's lifetime so switching back to a track doesn't refetch (a small module-level map with a size cap is fine). **Never log the URL** (it has the token).
2. **`src/components/SubtitleView.tsx`** (new):
   - `SubtitleStyle` type (text colour, background colour, outline colour, text size, bottom offset as a fraction of the height) and `DEFAULT_SUBTITLE_STYLE` from androidtv's defaults above, scaled with `src/theme` like other text.
   - `SubtitleView({cues, style?})`: absolutely positioned over the video, `pointerEvents="none"`, not focusable; centred lines at the bottom offset; renders nothing when there are no cues. Spans keep italic/bold/underline. Long lines wrap within a max width.
   - The outline: check how Vega's RN renders `textShadow*` (Vega docs via the Amazon Devices MCP / `search_documentation`) and use the closest you can get to androidtv's black stroke; if text shadows don't render on Vega, say so and fall back to a translucent black box behind the text. Note what you chose.
3. No other source files. Don't wire anything into `PlayerScreen` (10d does).

## Tests
- `test/playback/subtitles.spec.ts`: parser cases above (each header/block kind, both timestamp forms, settings ignored, ids, CRLF, BOM, tags and nesting, unknown tags stripped, entities, malformed cue skipped, unsorted input sorted); `activeCues` at boundaries (start inclusive, end exclusive), overlapping cues, gaps, before first / after last, a long cue overlapping later short ones; the hook: loads, no fetch without URL, abort on URL change (a late response for the old URL is ignored), error on HTTP failure and on network failure, cache hit on return to a URL.
- `test/components/SubtitleView.spec.tsx`: nothing rendered without cues; lines and spans; italic/bold/underline styles; default style values; a custom style applied.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No device check: 10e checks the whole task on the Fire TV.

## Rules
- Source files: `src/playback/subtitles.ts`, `src/components/SubtitleView.tsx`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files added, the cue shape and the exported API 10d will use
- how the outline renders on Vega and why
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
