# Task 10c: audio / subtitle track picker

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-10c-picker (branch `task/10c-picker`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md ("Playback design") first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the look and behaviour, don't copy code): `app/src/main/java/org/jellyfin/androidtv/ui/playback/overlay/action/ClosedCaptionsAction.kt` and the audio action next to it (a popup listing the tracks, the current one checked, "None" for subtitles off).

## The task 10 approach (approved)
- The player's **paused overlay** gets two buttons, Audio and Subtitles (10d wires them). Each opens this picker. Task 11 redoes the overlay later; this picker should be reusable there.
- Subtitles: an "Off" entry (index `-1`) plus each track; Audio: each track, no Off.
- Picking a track calls back with its stream index; 10d decides whether that's a client-side subtitle switch or a re-resolve.
- Pickers on Details are out of scope.

**What's already on `main`**: `src/playback/types.ts` has `MediaTrack` (`index`, `label`, `language?`, `isDefault?`) and `SubtitleTrack` (adds `delivery`). Take `MediaTrack[]` so both fit. Don't change the types; say so in the report if they need a change.

**Running in parallel:** 10a (`resolver.ts`, `deviceProfile.ts`, `reporting.ts`) and 10b (`src/playback/subtitles.ts`, `src/components/SubtitleView.tsx`). Don't touch those, `PlayerController.ts`, `PlayerScreen.tsx` or anything under `src/vendor/`.

## Setup
- Run `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`tsc` needs the vendored Shaka files; Jest doesn't).

## Scope (only this)
1. **`src/components/TrackPicker.tsx`** (new): `TrackPicker({title, tracks, selectedIndex, offLabel?, onSelect, onClose})`.
   - `offLabel` set → an extra first entry with index `-1` (subtitles use it; pick androidtv's wording for the label in the report, the caller passes it).
   - A compact dark panel over the video (androidtv's popup: title, one row per track, a check on the selected one). Rows show the track `label`; mark the default with a small "Default" note if androidtv does something similar, otherwise leave it out. Use `src/theme` tokens and the same focus look as `FocusableButton` (cyan focus, violet `active` outline); reuse `FocusableButton` if it fits, or a small row component inside this file if a check mark needs it.
   - Opens with the selected row focused (else the first). Focus stays inside the panel (Vega `TVFocusGuideView` trap / `FocusManager`; check the Vega focus docs via the Amazon Devices MCP or the `amazon-devices-vega-focus-management` skill). Long lists scroll and keep the focused row visible.
   - Select on a row → `onSelect(index)` (also for the row already selected; the caller ignores it). **Back closes** it (`onClose`) and must not reach the screen behind it: register a `BackHandler` listener while mounted that returns `true` (React Native calls the latest listener first; check that holds on Vega 0.83 and in `test/setup.tsx`'s BackHandler stand-in).
   - Note for 10d (don't do it here): `PlayerScreen`'s `useTVEventHandler` toggles pause on `select`/`enter`; 10d must ignore those while a picker is open. If the picker can help (e.g. an exported hook or prop), say so in the report.
2. No other source files. Don't wire it into `PlayerScreen` (10d does).

## Tests
- `test/components/TrackPicker.spec.tsx`: title and rows; Off row only with `offLabel`, index `-1`; check mark on the selected row (including Off); initial focus on the selected row, else the first; `onSelect` with the right index; Back calls `onClose` and returns `true` (handled); the listener is removed on unmount; empty `tracks` with and without Off.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- Look check on the **Vega simulator** (UI only, see "Vega Virtual Device" in HANDOFF Gotchas; run every install/input/screenshot inside `flock /tmp/caravela-sim.lock -c '…'`): temporarily render the picker with a few fake tracks somewhere easy to reach (e.g. on top of Home), take a screenshot, check focus moves with Up/Down and stays inside, then **remove the temporary code before committing**. If the simulator isn't running, start it with `vega virtual-device start`. A fresh install wipes the session; if you need to sign in, use Quick Connect: print the code on its own line as `QUICK CONNECT CODE: <code>`, keep polling, and fetch a new code if one expires. Never use a password. Keep screenshots in your scratchpad, never in the repo.

## Rules
- Source files: `src/components/TrackPicker.tsx`. Tests as listed. Nothing else in the commit.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the component API and how focus trapping and Back work on Vega
- the screenshot path (scratchpad) and what you checked on the simulator
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
