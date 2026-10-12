# Task 7.5c: series and season details pages

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075c (branch `task/075c-series-season`, from `task/075-tv-details`, which has 7.5a, 7.5b-1 and 7.5b-2 merged).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then the 7.5 briefs (`docs/tasks/075*.md`) and `src/screens/details/` (`DetailsLayout.tsx`, `MovieDetails.tsx` — your model), `src/api/tvDetails.ts`, `src/api/itemInfo.ts`, `src/api/details.ts`, `src/components/DetailsHeader.tsx`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** Reference clone: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only), `app/src/main/java/org/jellyfin/androidtv/ui/itemdetail/FullDetailsFragment.java` (series rows in `addAdditionalRows` ~line 590, buttons ~line 760, `handleResumeButtonAndFocus` ~line 1075) and `FullDetailsFragmentHelper.kt` (`resumePlayback`, `getNextUpEpisode`).

**Another agent runs at the same time:** 7.5d (Episode and Person pages) in `../caravela-wt/task-075d`, writing `src/screens/details/EpisodeDetails.tsx` and `PersonDetails.tsx`. **Don't touch those, `DetailsScreen.tsx`, the navigator or `LibraryScreen.tsx`** — the wiring (dispatch by type, removing `DetailsPlaceholder`) is 7.5e, after you.

## Available (don't change; if a bug forces it, say so)
- `DetailsLayout` (`testID`, `backdropUri?`, `header: DetailsHeaderProps`, `actions: DetailsAction[]`, `children`) and `primaryImageUri(item, api, size)` in `src/screens/details/DetailsLayout.tsx`.
- `DetailsHeaderProps` now has `subtitle?` and `posterShape?: 'poster' | 'wide' | 'square'`.
- `tvDetails.ts`: `useSeasons(seriesId)`, `useSeasonEpisodes(seriesId, seasonId)`, `useSeriesNextUp(seriesId)`, `fetchSeasons`, `fetchSeasonEpisodes`, keys `tvDetailsKeys`.
- `itemInfo.ts`: `infoRowEntries`, `detailsInfoItems` (series → "Seasons" N, Runs, Ends), `detailsTitles(item)`, `peopleToCards`, `resumePositionMs`, `resumeLabel`, `seasonPlayTarget(episodes)`, `seriesShowsResume(series, nextUp)`.
- `details.ts`: `useSimilarItems`, `useToggleFavorite`, `useTogglePlayed` (invalidate every details query on settle).
- `toCardItem(item, api, {variant: 'poster' | 'landscape'})`.

## Scope (only this)
1. **`src/screens/details/SeriesDetails.tsx`** (new), props `{item, navigation}` like `MovieDetails`:
   - Header: series poster, `infoRowEntries`, genres, overview, `detailsInfoItems`.
   - Actions in androidtv's order: **Resume from …** (only when `seriesShowsResume(item, nextUp[0])` and the next-up episode has a position → start there), **Play** (the next-up episode from 0), **Watched**, **Favorite**. With **no next-up episode** (all watched or nothing started), Play plays the series' first episode: on press, fetch it through the query client (`fetchSeasons`, skip the specials season `IndexNumber === 0` unless it's the only one, then `fetchSeasonEpisodes`, first episode), then open it. Resume when androidtv would show it but the episode has no position plays it from 0 (as androidtv does). No queue or autoplay (task 12).
   - Play/Resume `navigation.navigate('Player', {itemId: episode.Id, title: <episode name>, startMs})` (navigate, not push, like the movie page).
   - **Initial focus:** the first action must be right on open. Keep showing the loading view (spinner with the title, as `DetailsScreen` does) until next up has settled (success **or** error), then render the page, so Resume/Play doesn't appear after focus has landed.
   - Rows (hide empty ones; a row's error hides that row, never the page): **Next up** (`useSeriesNextUp`, landscape cards), **Seasons** (`useSeasons`, poster cards), **Cast & crew** (`peopleToCards`, unique ids like the movie page), **More like this** (`useSimilarItems`, poster).
   - Card presses `navigation.push('Details', {itemId, title})` (seasons, episodes, similar series, people). People will open their page once 7.5e wires it.
2. **`src/screens/details/SeasonDetails.tsx`** (new):
   - Header: `detailsTitles` (title = season name, subtitle = series name); poster = the season's Primary, else the series' (`SeriesPrimaryImageTag` with `SeriesId`); `infoRowEntries`, overview; **no info items** (`[]`: "Directed by" makes no sense for a season). Backdrop: the series backdrop (check `backdropUris` covers parent backdrops for seasons).
   - Actions: Resume / Play of `seasonPlayTarget(episodes)` (Resume only when it has a position), Watched, Favorite. Same loading rule: render once the episodes have settled. Episodes error → the page still shows (no Play), with the row hidden.
   - Row: **Episodes** (`useSeasonEpisodes(item.SeriesId, item.Id)`, landscape cards with the episode's own image, progress shown). Press → push `Details` for the episode.

## Tests
- `test/screens/SeriesDetails.spec.tsx` and `test/screens/SeasonDetails.spec.tsx` (mock the hooks like `test/screens/DetailsScreen.spec.tsx` does): loading until next up / episodes settle; Resume vs Play rules (next-up with and without a position, partly watched series, all watched → first-episode fetch, specials skipped, nothing to play); Play/Resume navigate to `Player` with the episode id and start; toggles; empty and errored rows hidden; card presses push `Details`; season poster fallback to the series poster; season with no episodes.

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
