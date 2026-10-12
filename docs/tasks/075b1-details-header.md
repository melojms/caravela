# Task 7.5b-1: details header subtitle and poster shapes

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075b1 (branch `task/075b1-details-header`, from `task/075-tv-details`).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then `docs/tasks/07b-details-ui.md` and `src/components/DetailsHeader.tsx`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Task 7.5 overall:** the details page now also covers series, seasons, episodes and people. Episodes show a 16:9 thumbnail and "Lost S1 E2" under/over the title; seasons show the series name; people show a photo. This subtask only extends the header component.

**Match the official jellyfin-androidtv app.** Reference clone: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only). Look at `app/src/main/java/org/jellyfin/androidtv/ui/itemdetail/MyDetailsOverviewRow.kt`, `ui/DetailRowView.kt` (or wherever the overview row layout lives; also `res/layout/` for the details overview row) to see how the poster size changes by image aspect and where androidtv puts an episode's series name / episode number.

**Other agents run at the same time — don't touch their files:** 7.5a (`src/api/tvDetails.ts`, `details.ts`, `itemInfo.ts`) and 7.5b-2 (`src/screens/DetailsScreen.tsx`, `src/screens/details/`). 7.5b-2 passes `DetailsHeaderProps` through as a whole, so **only add optional props**; existing callers must render exactly as before.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (otherwise `tsc` fails).

## Scope (only this)
**`src/components/DetailsHeader.tsx`:**
- `subtitle?: string` — a secondary line tied to the title (episode: "Lost S1 E2"; season: the series name). Place and style it like androidtv; muted text, one line, ellipsised.
- `posterShape?: 'poster' | 'wide' | 'square'` (default `'poster'`, today's 2:3). `'wide'` = 16:9 (episode thumbnails), `'square'` for whatever androidtv shows square. Keep the header's overall height sensible: size the wide poster like androidtv does (it uses the same height or a fixed width — check), and make sure the text column still gets enough width for the overview.
- The `src/components/detailsIcons.tsx` already has the new `previous` and `series` action icons (step 0); no change needed there.

## Tests
- `test/components/DetailsHeader.spec.tsx`: subtitle shown / absent, each poster shape's frame size (aspect), default unchanged, placeholder still used without a poster in every shape.

## Checks
- `npm run lint` (0 errors; baseline 40 warnings), `npx tsc --noEmit`, `npm test`. No simulator check now (7.5f checks the pages on the simulator).

## Rules
- Source files: `src/components/DetailsHeader.tsx` only. Tests as listed.
- Commit to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the new props (exact types)
- what you took from androidtv (and anything deliberately different)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
