# Task 11e: wire the overlay into the player

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11e (branch `task/11e-player-wiring`, from `main`).
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

**Already on `main`** (merged from 11a–11d; use it, change it only if broken and say why):

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `src/playback/types.ts`: `TrickplayInfo`, `TrickplayTile`, `Chapter`, `PlayerTitle`, `ZoomMode`, `PLAYBACK_SPEEDS` / `PlaybackSpeed`.
- `src/playback/trickplay.ts`: `trickplayInfo(item, mediaSourceId)`, `trickplayTile(api, info, positionMs)`.
- `src/playback/chapters.ts`: `itemChapters(api, item)`, `currentChapterIndex(chapters, positionMs)` (0 before the first, -1 for none).
- `src/api/itemInfo.ts`: `playerTitle(item)`.
- `src/playback/PlayerController.ts`: 4th constructor arg `options?: {playbackRate?: number}`, `playbackRate` / `setPlaybackRate(rate)`, `canSeek`, `seekTo(ms)` / `seekBy(deltaMs)` (clamped to duration − 1 s; quick `seekBy`s add up), `STALL_TIMEOUT_MESSAGE` (the stall watchdog is inside the controller; nothing to wire beyond the existing `onError`).
- `src/components/PlayerOverlay.tsx`: `PlayerOverlay` (props `title`, `positionMs`, `durationMs`, `paused`, `canSeek`, `thumbnailAt?`, `hint?`, `focus: {target: OverlayFocus; key}`, `hasSubtitles`, `hasAudio`, `hasChapters`, `playbackSpeed?`, `onPlayPause`, `onRewind`, `onFastForward`, `onSeek(ms)`, `onSubtitles`, `onAudio`, `onChapters`, `onSpeed`, `onZoom`, `onScrubbingChange?`, `onActivity?`, `onControlsLayout?(topY)` in dp from the screen top), `OverlayFocus`. Read the file for details (focus wiring, fallbacks).
- `src/components/SeekBar.tsx` (used by the overlay): `SEEK_BACK_STEP_MS` / `SEEK_FORWARD_STEP_MS`. It handles Left/Right/OK itself only while focused.
- `src/components/ChapterRow.tsx`: `ChapterRow({chapters, currentIndex, onSelect, onClose, testID?})`; handles Back (own `BackHandler` listener), Up/Down (→ `onClose`) and OK (→ `onSelect` only; the caller seeks and closes).
- `src/components/TrackPicker.tsx` (Back handled itself, doesn't close on a pick).

## Scope (only this)
Source files: **`src/screens/PlayerScreen.tsx`**, **`src/screens/PlayerSubtitles.tsx`**, and **one new file** (e.g. `src/screens/usePlayerOverlay.ts` for the overlay visibility/timer/key logic, so the screen stays readable). Remove the old inline `PlayerOverlay` from `PlayerScreen.tsx`.

1. **Item data:** `useItemDetails(itemId)` (`src/api/details.ts`, already has `Trickplay` and `Chapters`). Title: `playerTitle(item)`, falling back to `{title: route.params.title}` while it loads or if it fails. Trickplay: `trickplayInfo(item, session.mediaSourceId)` → `thumbnailAt = ms => trickplayTile(api, info, ms)` (memoised). Chapters: `itemChapters(api, item)`. A failed item load must not affect playback.
2. **Overlay visibility** (androidtv `CustomPlaybackOverlayFragment` key listener + Leanback fading):
   - Hidden while playing. **Any D-pad key** (`up`/`down`/`left`/`right`) with the overlay hidden shows it and does nothing else: Left/Right focus the **seek bar** (no scrub step), Up/Down focus **Play/Pause**. Make sure the key that showed it isn't also handled by the newly focused seek bar.
   - Shows on pause (as today), while loading after playback started, and **while a track switch reloads** (today it's hidden then, so Back leaves the player: fix that).
   - **Auto-hide** after a few seconds with no input while playing (use Leanback's `PlaybackSupportFragment` fade delay if you can confirm it; otherwise 5 s and say so). Any key, focus change (`onActivity`) or scrub restarts the timer. No auto-hide while paused, scrubbing, or while a picker or the chapter row is open.
   - **Back:** a picker / the chapter row closes first (their own listeners). Otherwise, overlay up → hide it (playback stays as it is; if paused, it stays paused and the next OK release resumes, as androidtv's comment describes). Overlay hidden → leave the player.
   - OK with the overlay hidden keeps toggling pause on release (existing logic). With the overlay up, OK goes to the focused control.
   - The remote's **fast-forward** (`skip_forward`) / **rewind** (find its `eventType` on the simulator or in Vega docs; log it) seek +30 s / −10 s with `seekBy` right away, at any time (also with the overlay hidden; not while a picker or the chapter row is open), and show the overlay so the position is visible (auto-hide applies). Held keys repeat.
   - The play/pause keys keep working as today.
3. **Overlay wiring:** Play/Pause → `togglePause`; Rewind / Fast-forward buttons → `seekBy(−10 s / +30 s)`; `onSeek(ms)` → `seekTo(ms)` and update the shown position right away (11c noted the bar jumps back otherwise). `canSeek` from the controller (re-read on state/position changes). Position updates: the screen currently skips renders on `timeupdate` while playing because the overlay only showed while paused; now update the position while the overlay is visible, and keep skipping when it's hidden.
4. **Pickers** (reuse `TrackPicker`, focus back to the opener on close, as today):
   - Subtitles / Audio: unchanged behaviour.
   - **Speed:** `PLAYBACK_SPEEDS`, labels like androidtv's (check `PlaybackSpeedAction.kt` for the text), current selected. The choice lives in a **module-level** variable so it lasts for the app's lifetime (androidtv's `previousSpeedSelection`), is passed as `options.playbackRate` to every new controller (first start, Retry, track switches), and applied with `setPlaybackRate`. Pass it as the overlay's `playbackSpeed` ("Ends at" uses it).
   - **Zoom:** Fit / Auto crop / Stretch (androidtv labels) → state `ZoomMode` → `KeplerVideoSurfaceView` `scalingmode` `fit` / `fill` / `strech`. Starts at Fit on each player open.
5. **Chapters:** the Chapters button opens `ChapterRow` with `currentChapterIndex(chapters, positionMs)`; OK on a chapter → `seekTo(chapter.startMs)`, close the row, focus back on the Chapters button. While the row is open, the screen's key handler must ignore D-pad and OK (the row owns them; `useTVEventHandler` sends every key to every handler), and the overlay doesn't auto-hide. Hide the overlay's bottom controls (or the whole overlay, your call) while the row is up so they don't show through.
6. **Subtitles under the overlay (Amazon's caption guidance):** while the overlay is up, external subtitles stay visible and move up so their bottom sits just above `onControlsLayout`'s `topY` (with a small gap); when it hides, they go back to their normal position. Hide them while scrubbing (the trickplay thumbnail sits there) and while the chapter row is open. Keep PlayerSubtitles' "only subtitles re-render while playing" design.
7. **"Loading subtitles…" hint:** while the shown external track's cues are loading (`useSubtitleCues` has `loading`; embedded tracks take ~30 s the first time), show the hint: as the overlay's `hint` when it's up, and as a small unobtrusive label where subtitles appear when it's hidden. A load error shows nothing (as today).
8. Everything else keeps working: resolve/Retry/errors, the start/stall watchdog error view, track switching, `ended` → back, invalidating details + Home on exit.

## Tests
Extend `test/screens/PlayerScreen.spec.tsx` (mocks as it does now; mock `useItemDetails` or the API it uses), and a spec for the new hook file if it has logic worth testing alone:
- show on D-pad keys with the right focus target and no scrub step; auto-hide timing (fake timers) and what restarts/suspends it; Back hides, then leaves; OK release while hidden toggles pause; OK while shown doesn't
- FF/rewind keys call `seekBy` with ±, also with the overlay hidden, not while a picker/the chapter row is open
- overlay stays up during a track-switch reload; Back then hides it rather than leaving
- speed picker: applies, kept for a new controller (Retry) and across screen mounts; zoom picker changes `scalingmode` and resets on a new mount
- chapters: opens on the current chapter, select seeks + closes + refocuses, keys ignored by the screen while open; no Chapters button without chapters
- title from the item (episode subtitle), fallback while loading; trickplay `thumbnailAt` built for the playing media source; none without trickplay
- subtitles move above the controls when shown, hidden while scrubbing / chapter row; loading hint in both places

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the two known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone), `npm run build:release`.
- **Vega simulator check** (the user wants the simulator for this task's checks; the Fire TV comes later and the orchestrating session runs it; don't use the Fire TV). See "Vega Virtual Device" in HANDOFF Gotchas; run every install/input/screenshot inside `flock /tmp/caravela-sim.lock -c '…'`; screenshots stay in your scratchpad (they can show the server address), never in the repo. Playback stalls 3–6 s in on the simulator: pause early and do most checks paused; note anything that needs the TV.
  - Sign in on the test server (address in `docs/LOCAL.md` of the main checkout) as **`demo` with an empty password** (Password screen).
  - The test server has **no trickplay and no chapter images**; 15 movies have chapters (find one via the API or the UI). Check there: overlay show/hide on keys and auto-hide, Back hide-then-leave, seek bar scrub + OK seek, FF/rewind keys, chapter row open/seek/close, speed and zoom pickers (zoom visibly changes the picture), the title of an episode, subtitles above the overlay and the loading hint (an embedded-subtitle movie such as Paterson).
  - **Trickplay:** Jellyfin's public demo server has it (`demo.jellyfin.org/stable`, user `demo`, empty password; e.g. the movie "Earthfall"). Add it as a second server and check the thumbnail while scrubbing. Don't change anything there (no watched/favourite toggles; play from the start and leave within a minute). A plain `curl` of a sheet from there returned a bot-check HTML page instead of the image: if the thumbnail stays a dark placeholder on the simulator, say so and check whether the Image request got HTML.
  - Look at your screenshots yourself and describe what you saw.

## Rules
- Only the files listed in Scope, plus tests. If something outside them is broken, say so in the report instead of changing it (a tiny fix in an 11a–11d file is OK if it blocks you; explain it).
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering: files changed; the overlay state machine (when it shows/hides, focus targets, Back, keys); the rewind key's `eventType`; the fade delay you used and where it came from; what you saw on the simulator for each check (screenshot paths); the test count and lint result; edge cases and suggested tests; anything that needs the Fire TV; anything unresolved.
