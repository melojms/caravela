# Task 7.5b-2: shared details layout, movie page moved out

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075b2 (branch `task/075b2-details-layout`, from `task/075-tv-details`).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then `docs/tasks/07c-details-screen.md` and `src/screens/DetailsScreen.tsx`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Task 7.5 overall:** `DetailsScreen` will pick a page by item type: Movie, Series, Season, Episode, Person (7.5c/7.5d write the new pages). They all share the movie page's layout: backdrop, header, action buttons, then content rows, with the scroll-to-top when the buttons regain focus and "only the first action on open takes focus". This subtask is a **refactor with no visible change**: pull that layout out so every page reuses it, and move the movie page into its own file.

**Other agents run at the same time — don't touch their files:** 7.5a (`src/api/tvDetails.ts`, `src/api/details.ts`, `src/api/itemInfo.ts`; it keeps every current export working) and 7.5b-1 (`src/components/DetailsHeader.tsx`, which only gains optional props).

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (otherwise `tsc` fails).

## Scope (only this)
1. **`src/screens/details/DetailsLayout.tsx`** (new):
   - `DetailsLayout` props: `testID`, `backdropUri?`, `header: DetailsHeaderProps` (passed through whole, so new optional header props work without changes here), `actions: DetailsAction[]`, `children` (the rows).
   - Owns `ScreenContainer` + `Backdrop`, the `ScrollView`, `DetailsHeader`, the `TVFocusGuideView` (autoFocus, scroll to top on focus) around `DetailsActions`, and the `initialFirst` ref rule from today's `MovieDetails`.
   - **No actions** (people have none): render no action row; the page then gives its first row preferred focus. Make sure `initialFirst` copes with an empty list.
   - Export a small helper for the header poster URL, e.g. `primaryImageUri(item, api, size)` (today's inline `posterTag`/`imageUrl` code), so pages don't repeat it.
2. **`src/screens/details/MovieDetails.tsx`** (new): today's `MovieDetails`, unchanged in behaviour, built on `DetailsLayout`.
3. **`src/screens/DetailsScreen.tsx`**: keeps loading / error / Retry / 401 and the type dispatch (Movie → `MovieDetails`, anything else → the placeholder, as now). 7.5e will add the new types.

## Tests
- `test/screens/DetailsScreen.spec.tsx` must keep passing unchanged (move or split it only if imports force it, and say so).
- `test/screens/DetailsLayout.spec.tsx` (new): header and actions rendered, first action preferred only on open (not after the first action changes), no action row with `actions=[]`, children rendered below.

## Checks
- `npm run lint` (0 errors; baseline 40 warnings), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- No simulator check now; 7.5f checks every page on the simulator.

## Rules
- Source files: the three above. Tests as listed.
- Commit to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the `DetailsLayout` API (exact props) that 7.5c/7.5d will use
- the test count and lint/build result
- edge cases and suggested tests
- anything unresolved
