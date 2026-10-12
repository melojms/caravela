# Task 7.5d: episode and person details pages

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075d (branch `task/075d-episode-person`, from `task/075-tv-details`, which has 7.5a, 7.5b-1 and 7.5b-2 merged).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then the 7.5 briefs (`docs/tasks/075*.md`) and `src/screens/details/` (`DetailsLayout.tsx`, `MovieDetails.tsx` — your model), `src/api/tvDetails.ts`, `src/api/itemInfo.ts`, `src/api/details.ts`, `src/components/DetailsHeader.tsx`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** Reference clone: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only), `app/src/main/java/org/jellyfin/androidtv/ui/itemdetail/FullDetailsFragment.java` (episode and person rows in `addAdditionalRows` ~line 570–650; buttons ~line 760–1010 incl. Previous episode and Go to series) and `FullDetailsFragmentHelper.kt` (`populatePreviousButton`).

**Another agent runs at the same time:** 7.5c (Series and Season pages) in `../caravela-wt/task-075c`, writing `src/screens/details/SeriesDetails.tsx` and `SeasonDetails.tsx`. **Don't touch those, `DetailsScreen.tsx`, the navigator or `LibraryScreen.tsx`** — the wiring (dispatch by type, removing `DetailsPlaceholder`) is 7.5e, after you.

## Available (don't change; if a bug forces it, say so)
- `DetailsLayout` (`testID`, `backdropUri?`, `header: DetailsHeaderProps`, `actions: DetailsAction[]` — `[]` renders no action row, `children`) and `primaryImageUri(item, api, size)` in `src/screens/details/DetailsLayout.tsx`.
- `DetailsHeaderProps` now has `subtitle?` and `posterShape?: 'poster' | 'wide' | 'square'`.
- `DetailsActionIcon` has `previous` and `series` (icons in `detailsIcons.tsx`).
- `tvDetails.ts`: `usePreviousEpisode(episode)` (→ `BaseItemDto | null`; it fixes androidtv's first-episode bug and can cross into the previous season), `useNextEpisodes(episode)`, `usePersonItems(personId, 'Movie' | 'Series' | 'Episode')` (limit 100).
- `itemInfo.ts`: `infoRowEntries` (episode `S1:E2`; person born/died/birthplace), `detailsInfoItems` (person → `[]`), `detailsTitles(item)`, `peopleToCards(item, api, kinds?)`, `resumePositionMs`, `resumeLabel`.
- `details.ts`: `useToggleFavorite`, `useTogglePlayed`.
- `toCardItem(item, api, {variant: 'poster' | 'landscape'})`.

## Scope (only this)
1. **`src/screens/details/EpisodeDetails.tsx`** (new), props `{item, navigation}` like `MovieDetails`:
   - Header: `detailsTitles` (title = episode name, subtitle e.g. "Lost S1 E2"), the episode's thumbnail with `posterShape="wide"` (landscape image size), `infoRowEntries`, overview, `detailsInfoItems`. Backdrop: the episode's, else the series' (`backdropUris`).
   - Actions in androidtv's order: **Resume from …** (when resumable), **Play**, **Watched**, **Favorite**, **Previous episode** (`previous` icon; only when `usePreviousEpisode` found one; push `Details` for it), **Go to series** (`series` icon; when `SeriesId` is set; push `Details` for the series, as androidtv navigates). Play/Resume `navigation.navigate('Player', {itemId, title, startMs})` like the movie page. Previous appearing later must not steal focus (`DetailsLayout` already only focuses the first action on open).
   - Rows (hide empty; a row's error hides only that row): **Next episodes** (`useNextEpisodes`, landscape cards with the episode's own image), **Guest stars** (`peopleToCards(item, api, [PersonKind.GuestStar])`, unique ids like the movie page). Chapters are task 11.
2. **`src/screens/details/PersonDetails.tsx`** (new):
   - Header: name, photo (`posterShape="poster"`), `infoRowEntries` (born / died / birthplace), overview = the biography, no info items. No backdrop (people have none; leave `backdropUri` undefined).
   - No actions (`actions=[]`; androidtv shows only Favorite for a person — check the reference and include Favorite if it does; then it's the first action and takes focus).
   - Rows: **Movies**, **TV series**, **Episodes** (`usePersonItems`; poster cards for movies/series, landscape for episodes; hide empty or errored). With no actions, the first non-empty row takes preferred focus once the rows have settled (show the loading view until all three settle, so focus lands right). Add top spacing above the first row if the layout leaves none (7.5b-2 noted the action row's margins are the only gap).
   - A person with nothing in any row: the header alone, with something focusable or at least no stuck focus — decide and explain.
   - Card presses push `Details`.

## Tests
- `test/screens/EpisodeDetails.spec.tsx`, `test/screens/PersonDetails.spec.tsx` (mock hooks like `test/screens/DetailsScreen.spec.tsx`): header texts and wide poster; Resume/Play rules and `Player` params; toggles; Previous shown only with a previous episode and pushes it; Go to series shown only with `SeriesId`; Next episodes and Guest stars rows (only guest stars, hidden when none); person rows hidden when empty/errored, first non-empty row focused, loading until settled, nothing at all; card presses push `Details`.

## Checks
- `npm run lint` (0 errors; baseline 40 warnings), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- No simulator check yet (nothing routes to these pages until 7.5e; 7.5f checks them on the simulator).

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- Known flake: `test/auth/RootNavigator.spec.tsx` › "starts at UserPicker with the expired notice" sometimes fails under load; rerun before chasing it.

## Rules
- Source files: the two pages above. Tests as listed.
- Commit to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported components/props 7.5e will wire
- what you took from androidtv (and anything deliberately different)
- the test count and lint/build result
- edge cases and suggested tests
- anything unresolved
