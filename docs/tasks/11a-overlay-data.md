# Task 11a: overlay data (trickplay, chapters, player title)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11a (branch `task/11a-overlay-data`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design" step 6) first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, Jellyfin 12.2 test server.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). The legacy Leanback player is the reference: `app/src/main/java/org/jellyfin/androidtv/ui/playback/` (`CustomPlaybackOverlayFragment.java`, `PlaybackController.java`, `VideoSpeedController.kt`, `overlay/CustomPlaybackTransportControlGlue.java`, `overlay/CustomSeekProvider.kt`, `overlay/action/*`).

## The task 11 approach (approved)
- **Overlay:** hidden while playing; any D-pad key shows it; it hides itself after a few seconds with no input while playing (Leanback's timing); stays while paused. Back with the overlay up hides it; Back with it hidden leaves the player. OK still pauses on its release when the overlay is hidden.
- **Layout:** top: title (an episode shows its series name, then `S1:E2 · Episode name`). Bottom: seek bar with elapsed / remaining / "Ends at", then one row of round icon buttons: primary actions Play/Pause, Rewind, Fast-forward, Subtitles (if any), Audio (if >1), and right-aligned secondary actions Chapters (if any), Speed, Zoom. No Quality button (task 14), no Previous/Next item (task 12).
- **Seeking:** steps of 10 s back / 30 s forward (androidtv's `skipBackLength` / `skipForwardLength`). On the focused seek bar Left/Right move a scrub cursor with a **trickplay** thumbnail above it; OK seeks there; moving focus away cancels. With the overlay hidden, Left/Right only bring the overlay up (seek bar focused, no step). The remote's fast-forward / rewind keys seek +30 s / −10 s right away and show the overlay briefly.
- **Trickplay:** the item's `Trickplay` info for the playing media source; tile sheets from `/Videos/{id}/Trickplay/{width}/{index}.jpg`; the thumbnail is one cell of the sheet shown through a clipped `Image`; dark placeholder while loading; no trickplay → no thumbnail.
- **Chapters:** a horizontal row of chapter cards (image, name, start time) over the controls, opening on the current chapter; OK seeks; Up/Down/Back close it.
- **Speed:** 0.25×–2× picker (`TrackPicker`), kept for the app's lifetime (androidtv). Vega's `VideoPlayer.playbackRate`.
- **Zoom:** Fit / Auto crop / Stretch → `KeplerVideoSurfaceView` `scalingmode` `fit` / `fill` / `strech` (Amazon's spelling). Resets each time the player opens.
- **Subtitles:** follow Amazon's caption guidance: while the overlay is up, subtitles move up above the controls instead of hiding.
- Also: a "Loading subtitles…" hint while an external track's cues load; the overlay stays up while a track switch reloads (so Back doesn't leave); a stall watchdog after playback started (not while paused).

**Already on `main`** (`src/playback/types.ts`, use it, don't change it): `TrickplayInfo`, `TrickplayTile`, `Chapter`, `PlayerTitle`, `ZoomMode`, `PLAYBACK_SPEEDS` / `PlaybackSpeed`. Other subtasks run in parallel (11a data, 11b controller, 11c overlay UI, 11d chapter row); 11e wires everything into `PlayerScreen` later. Stay inside your file scope.

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.

## Scope (only this)
Pure functions, no React. The screen gets the item from `useItemDetails(itemId)` (`src/api/details.ts`; its `ITEM_FIELDS` already include `Trickplay` and `Chapters`).

1. **`src/playback/trickplay.ts`**
   - `trickplayInfo(item: BaseItemDto, mediaSourceId: string): TrickplayInfo | undefined`. `item.Trickplay` is `{[mediaSourceId]: {[width]: TrickplayInfoDto}}`. androidtv takes the first resolution; prefer width 320 when present, else the smallest width. Undefined when missing or any needed number is missing/≤0.
   - `trickplayTile(api: Api, info: TrickplayInfo, positionMs: number): TrickplayTile | undefined`: tile maths as `CustomSeekProvider.getThumbnail` (thumbnail = `floor(ms / interval)`, clamped to `0..thumbnailCount-1`; sheet index and cell offset from `tileWidth × tileHeight`). The URL is `getTrickplayApi(api).getTrickplayTileImageUrl` (check the SDK 1.0.0 signature) with `mediaSourceId`, plus the token as `api_key` (RN `Image` here gets no auth header; follow how `resolver.ts` adds `api_key`). `sheetWidth/Height` are the full sheet size (a last sheet may be shorter in reality; note in the report if that matters for the clipped view).
2. **`src/playback/chapters.ts`**
   - `itemChapters(api: Api, item: BaseItemDto): Chapter[]`: server order, `startMs` from `StartPositionTicks` (use `ticksToMs` from `src/api/itemInfo.ts`), `name` falls back the way androidtv's chapter cards do (check `buildChapterItems` / `ChapterItemInfo`), `imageUrl` only when `ImageTag` is set, via `imageUrl()` from `src/api/items.ts` with `ImageType.Chapter`, `index`, and a size that fits a ~16:9 card about 400 px wide.
   - `currentChapterIndex(chapters: Chapter[], positionMs: number): number`: the last chapter starting at or before the position (androidtv `getCurrentChapterIndex`); 0 before the first; -1 for no chapters.
3. **`src/api/itemInfo.ts`**: add `playerTitle(item: BaseItemDto): PlayerTitle`. Episode → `{title: SeriesName, subtitle: 'S1:E2 · Name'}` (reuse the existing `S1:E2` info-row formatting if there is one; handle a missing season or episode number, `IndexNumberEnd` multi-episodes like the info row does, and a missing series name → the episode name as title). Anything else → `{title: Name}`. Check androidtv's overlay title text (`CustomPlaybackTransportControlGlue` / `LeanbackOverlayFragment` / `VideoPlayerAdapter`) and mention any difference.

## Tests
- `test/playback/trickplay.spec.ts`: resolution choice; tile index and offsets at 0, mid-sheet, the first cell of the second sheet, past the end (clamped), negative; URL has width, index, mediaSourceId and `api_key`; missing data → undefined.
- `test/playback/chapters.spec.ts`: mapping, names, image URL only with a tag, `currentChapterIndex` edges (before the first, exact starts, after the last, empty).
- `playerTitle` cases in the existing `itemInfo` spec.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the two known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone).
- No device or simulator check for this subtask (11e checks the wired-up overlay on the simulator; the Fire TV check is later and run by the orchestrating session). Don't use the Fire TV.

## Rules
- Only the files listed in Scope, plus their tests. If something outside them is broken, say so in the report instead of changing it.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering: the files changed and the exported API (exact signatures, since 11e builds on them), decisions you made where androidtv differs or the brief left room, the test count and lint result, edge cases and suggested tests, and anything unresolved.
