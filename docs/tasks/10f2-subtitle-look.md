# Task 10f-2: a stronger subtitle outline, and no subtitles over the paused overlay

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10f2 (branch `task/10f2-subtitle-look`, from `main`).
Background: read docs/HANDOFF.md first ("Next: task 10 follow-ups", "How we work", "Shared Fire TV", "Screenshot (Fire TV)", "Remote input"), then docs/tasks/10b-subtitles.md and 10e-device-check.md. Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Jellyfin 12.2.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only): `app/src/main/java/org/jellyfin/androidtv/ui/player/base/PlayerSubtitles.kt`, `ui/settings/screen/customization/subtitle/composable/SubtitleStylePreview.kt` (how the black stroke is drawn), and whether androidtv shows subtitles while its controls overlay is up.

## What 10e found
- The outline (`SubtitleView.tsx`, one black `textShadow` with zero offset, radius ~12% of the text size) renders on Vega as a **faint soft glow**, not androidtv's crisp black stroke. Readable on mid-grey, weak on bright scenes.
- While paused, the subtitle line sits **on top of the overlay's progress bar and buttons** (`PlayerScreen.tsx` draws `PlayerSubtitles` and the overlay at the bottom).

**Running in parallel:** 10f-1 changes `src/playback/deviceProfile.ts`, `src/playback/reporting.ts` and `src/playback/PlayerController.ts`. Don't touch those. Both tasks use the Fire TV: always hold `flock /tmp/caravela-device.lock` for a whole flow, and **reinstall the app right before each of your flows** (the other agent may have installed its build in between).

## Setup
- `npm ci`, `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, `npm run build:release`; the TV is `192.168.50.124:5555`, package `build/armv7-release/caravela_armv7.vpkg`.
- The app on the TV is signed in as `demo`; `vega device install-app` keeps the sign-in. If you ever need to sign in again: `demo` with an empty password on the Password screen.
- Screenshots stay in your scratchpad; downscale before viewing (and crop the subtitle area at full resolution to judge the outline). Good test items: Ad Astra (external SRT, bright exterior scenes) and Paterson (embedded subrip). Reach them from Home (no Search yet); if they aren't in a row, give one a resume point with curl as `demo` and reset it at the end. Never print tokens or full URLs.

## Scope
1. **`src/components/SubtitleView.tsx`: a crisp outline.** Options to compare on the TV with screenshots (pick the best looking that stays cheap):
   - several stacked `textShadow` layers (e.g. render the text 4–8 times behind itself with small offsets in black, the usual React Native outline trick, with `pointerEvents="none"` and no extra focusable views);
   - a tighter single shadow (small radius, small offsets);
   - anything else Vega supports (check the Vega text docs via the Amazon Devices MCP; e.g. whether `-webkit-text-stroke`-like props exist — likely not).
   Keep the `SubtitleStyle` API (`outlineColor` transparent = no outline) and keep italics/bold/underline and wrapping identical across the layers, so the copies line up exactly. Mind the cost: subtitle lines are short and change at most a few times per second, but don't multiply views without need.
2. **Hide subtitles while the paused overlay is showing** (androidtv-style; check what androidtv does and say so). In `src/screens/PlayerScreen.tsx` / `src/screens/PlayerSubtitles.tsx`: don't draw the cues while the overlay (or a picker) is up, and draw them again right away when playback resumes, at the current position (no wait for the next cue change). Keep the "only subtitles re-render while playing" behaviour.
3. No other source files.

## Tests
- `test/components/SubtitleView.spec.tsx`: the outline layers render (count/offsets/colour), none with a transparent outline colour, spans and wrapping the same in every layer; existing cases still pass.
- `test/screens/PlayerScreen.spec.tsx` (and/or a `PlayerSubtitles` spec): no subtitles while paused/overlay/picker; back on resume with the right cue; the screen still doesn't re-render per `timeupdate`.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- Fire TV: before/after crops of the same cue on a bright scene and a dark one (the before is `main`'s build); paused overlay with no subtitle over it; resume shows the cue again.

## Rules
- Source files: `src/components/SubtitleView.tsx`, `src/screens/PlayerSubtitles.tsx`, `src/screens/PlayerScreen.tsx`. Tests as listed. Nothing from `src/vendor/`.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the outline approach chosen, the options compared and the crop paths
- what androidtv does with subtitles under its overlay, and what you did
- the test count and lint result, edge cases and suggested tests, anything unresolved
