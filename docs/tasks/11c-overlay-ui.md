# Task 11c: player overlay UI (overlay, seek bar with trickplay, icons)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11c (branch `task/11c-overlay-ui`, from `main`).
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
Presentational components; no controller, no data fetching. 11e wires them into `PlayerScreen` (today's inline `PlayerOverlay` in `src/screens/PlayerScreen.tsx` is what you replace; leave that file alone, 11e removes the old one). Look at the existing look: `src/components/DetailsActions.tsx` and `detailsIcons.tsx` (round icon buttons, SVG via `@amazon-devices/react-native-svg`), `FocusableButton.tsx`, `ToolbarClock.tsx` (12/24 h from `@amazon-devices/react-native-localize`), `src/theme`.

1. **`src/components/playerIcons.tsx`**: SVG icons for play, pause, rewind, fast-forward, subtitles (CC), audio, chapters, speed, zoom (aspect ratio), drawn like `detailsIcons.tsx`.
2. **`src/components/SeekBar.tsx`**: a focusable bar (`testID` props for tests).
   - Props (adjust names if you have a good reason, and report the final ones): `positionMs`, `durationMs`, `canSeek`, `thumbnailAt?: (ms: number) => TrickplayTile | undefined`, `backStepMs` (10 000) / `forwardStepMs` (30 000), `hasTVPreferredFocus?`, `onSeek(ms)`, `onScrubbingChange?(scrubbing: boolean)`, `onActivity?()` (any key it handles, so the screen can restart the hide timer).
   - Shows the progress fill, elapsed time on the left, `-remaining` on the right, and "Ends at h:mm" (device 12/24 h; ends = now + remaining).
   - While focused: Left/Right move a scrub cursor by the step sizes (held keys repeat as more key-downs: each one steps), clamped to `0..duration`; the cursor shows its time and, when `thumbnailAt` returns a tile, the thumbnail above the cursor (a fixed-size View with `overflow: 'hidden'` holding an `Image` of `sheetWidth × sheetHeight` scaled to the thumbnail size and offset by `-offsetX/-offsetY`; a dark placeholder until it loads; keep the thumbnail inside the screen at both ends). OK (`select`/`enter`, on release, like `PlayerScreen` handles OK) calls `onSeek(cursorMs)` and ends scrubbing. Blur cancels scrubbing (cursor back to the position). `canSeek` false → no scrubbing.
   - Left/Right must not move focus off the bar: nothing is beside it, but check Vega's focus engine doesn't jump to the button row; use `nextFocusLeft/Right` to itself or `FocusManager.setNextFocus` if needed (see how `PosterGrid`/`LibraryScreen` did it).
   - Key events: `useTVEventHandler` from `@amazon-devices/react-native-kepler`, only acting while focused (see how `PlayerScreen` reads `eventType` / `eventKeyAction`; Left/Right are `left`/`right`).
3. **`src/components/PlayerOverlay.tsx`**: the full overlay.
   - Props: `title: PlayerTitle`, `positionMs`, `durationMs`, `paused`, `canSeek`, `thumbnailAt?`, `hint?: string` (e.g. "Loading subtitles…", shown small near the title), `focus: {target: OverlayFocus; key: number}` (the element to focus; changing `key` remounts to move focus, like today's overlay), `hasSubtitles`, `hasAudio`, `hasChapters`, callbacks `onPlayPause`, `onRewind`, `onFastForward`, `onSeek(ms)`, `onSubtitles`, `onAudio`, `onChapters`, `onSpeed`, `onZoom`, `onScrubbingChange?`, `onActivity?` (focus changes inside the overlay count too), and `onControlsLayout?(topY: number)` reporting the top edge of the bottom controls block in screen px, so subtitles can sit just above it. Export the `OverlayFocus` union (`'seek' | 'playpause' | 'rewind' | 'fastforward' | 'subtitles' | 'audio' | 'chapters' | 'speed' | 'zoom'`).
   - Layout (1080p canvas, use `px()` and theme tokens): a top gradient-ish scrim with the title (large) and subtitle; a bottom scrim with the seek bar, then one row: primary buttons on the left (Play/Pause icon toggles with `paused`, Rewind, Fast-forward, then Subtitles / Audio when present), secondary on the right (Chapters when present, Speed, Zoom). Icon-only round buttons; the focused one shows its label underneath (Leanback shows a label on focus). Rewind/Fast-forward only when `canSeek` (androidtv adds them only when it can seek).
   - Focus: Up from the button row goes to the seek bar, Down from the seek bar to the Play/Pause button.

## Tests
`test/components/SeekBar.spec.tsx` and `test/components/PlayerOverlay.spec.tsx` (look at how existing component specs drive `useTVEventHandler` and focus):
- seek bar: times and "Ends at" text; Left/Right steps and clamping; held key repeats; OK seeks to the cursor; blur cancels; no scrubbing without `canSeek`; thumbnail shown with the right offsets / hidden without a tile; keys ignored when not focused
- overlay: which buttons show (subtitles/audio/chapters/canSeek), play vs pause icon, initial focus from `focus`, callbacks, the label on the focused button, hint text, `onControlsLayout` called

## Extra check
Before finishing, render the overlay once on the **Vega simulator** if you can do it without touching other files' scope (e.g. a temporary local change you **don't commit**, mounting it over a still in a throwaway screen). If that is awkward, skip it and say so; 11e checks it for real. Simulator details are in HANDOFF Gotchas; wrap every install/input/screenshot in `flock /tmp/caravela-sim.lock -c '…'`; screenshots stay in your scratchpad. No sign-in is needed for a throwaway screen.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the two known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone).
- No device or simulator check for this subtask (11e checks the wired-up overlay on the simulator; the Fire TV check is later and run by the orchestrating session). Don't use the Fire TV.

## Rules
- Only the files listed in Scope, plus their tests. If something outside them is broken, say so in the report instead of changing it.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering: the files changed and the exported API (exact signatures, since 11e builds on them), decisions you made where androidtv differs or the brief left room, the test count and lint result, edge cases and suggested tests, and anything unresolved.
