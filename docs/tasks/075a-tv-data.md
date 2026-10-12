# Task 7.5a: series / season / episode / person details data

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075a (branch `task/075a-tv-data`, from `task/075-tv-details`).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then the task 7 briefs (`docs/tasks/07*.md`) and `src/api/details.ts`, `src/api/itemInfo.ts`, `src/api/items.ts`, `src/api/home.ts` (`fetchNextUp`). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Task 7.5 overall:** every item opens `Details`, and `DetailsScreen` picks a page by type (Movie, Series, Season, Episode, Person). Series: Resume/Play of its next-up episode, Watched, Favorite; rows Next up, Seasons, Cast & crew, More like this. Season: details layout with an Episodes row (wide cards), Play/Resume of the first unwatched episode, Watched, Favorite. Episode: like a movie plus Previous episode and Go to series (as in androidtv); rows Next episodes, Guest stars. Person: photo, bio, born/died/birthplace; rows Movies, TV series, Episodes. Series/season Play plays a single episode (no queue until task 12). This subtask is the data layer only.

**Match the official jellyfin-androidtv app.** Reference clone: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only; port the logic, don't copy code). Under `app/src/main/java/org/jellyfin/androidtv/`:
- `ui/itemdetail/FullDetailsFragment.java`: info items ~line 430 (series → "Seasons" N instead of "Directed by"), rows per type in `addAdditionalRows` ~line 524, resume/next-up logic ~line 785 and `handleResumeButtonAndFocus` ~line 1075.
- `ui/itemdetail/FullDetailsFragmentHelper.kt`: `getNextUpEpisode` (`getNextUp(seriesId, fields = itemFields, limit = 1)`), `populatePreviousButton` (`getEpisodes(seriesId, adjacentTo = id)`, first sibling that isn't the item), `resumePlayback`.
- `ui/browsing/BrowsingUtils.kt`: `createSeasonsRequest`, `createSeriesGetNextUpRequest`, `createNextEpisodesRequest` (zero-based start index = the episode's `IndexNumber`), `createPersonItemsRequest`.
- `ui/browsing/composable/inforow/BaseItemInfoRow.kt`: the info row per item type (series, season, episode, person).

**Other agents run at the same time — don't touch their files:**
- 7.5b-1 in `../caravela-wt/task-075b1`: `src/components/DetailsHeader.tsx` (adds `subtitle` and `posterShape`).
- 7.5b-2 in `../caravela-wt/task-075b2`: `src/screens/DetailsScreen.tsx` and a new `src/screens/details/` folder (`DetailsLayout.tsx`, `MovieDetails.tsx`). It uses the current exports of `details.ts` / `itemInfo.ts`, so **keep every existing export and signature backward compatible**.
- 7.5c / 7.5d (later) build the Series, Season, Episode and Person pages from your hooks and helpers.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (otherwise `tsc` fails on `src/vendor/shaka/`).
- Use Context7 for TanStack Query v5 if you need it. Check the SDK 1.0.0 method names in `node_modules/@jellyfin/sdk/lib/generated-client/api/` (e.g. `home.ts` already calls `getShowApi(api).getNextUp`; seasons/episodes live there too).

## Scope (only this)
1. **`src/api/tvDetails.ts`** (new), same patterns as `details.ts` (`useSession()`, keys starting with `detailsKeys.all(serverId, userId)` so one invalidation refreshes them all, `skipToken` when signed out or an id is missing, fields = `ITEM_FIELDS` from `details.ts`). Fetchers plus hooks:
   - `fetchSeasons(api, userId, seriesId)` / `useSeasons(seriesId)` — androidtv's `createSeasonsRequest`.
   - `fetchSeasonEpisodes(api, userId, seriesId, seasonId)` / `useSeasonEpisodes(seriesId, seasonId)` — all episodes of a season, in order.
   - `fetchSeriesNextUp(api, userId, seriesId)` / `useSeriesNextUp(seriesId)` — androidtv's `createSeriesGetNextUpRequest` (the Next up row). The page uses the first item as the Play/Resume target, like `getNextUpEpisode`.
   - `fetchPreviousEpisode(api, userId, episode)` / `usePreviousEpisode(episode)` → `BaseItemDto | null` — `adjacentTo`, like `populatePreviousButton`. **Check** that the first non-self sibling really is the previous one (adjacentTo returns previous, self, next; for the first episode it returns self, next). If androidtv is wrong there, pick the sibling that comes before by order and note it.
   - `fetchNextEpisodes(api, userId, seasonId, indexNumber)` / `useNextEpisodes(episode)` — androidtv's `createNextEpisodesRequest`; disabled without `SeasonId` or `IndexNumber`.
   - `fetchPersonItems(api, userId, personId, kind)` / `usePersonItems(personId, kind)` with `kind` Movie / Series / Episode — androidtv's `createPersonItemsRequest`, limit 100. (`getItems` is on `getLibraryApi` in SDK 1.0.0 — see `src/api/library.ts`.)
2. **`src/api/details.ts`**: the Watched/Favorite toggles keep the optimistic update on the item, but on settle invalidate **`detailsKeys.all(serverId, userId)`** (plus Home as now), because marking a series or season watched changes its episodes, next up and seasons. Nothing else changes.
3. **`src/api/itemInfo.ts`** (pure, no React; keep existing exports working):
   - `infoRowEntries(item)`: follow `BaseItemInfoRow` per type for Series (e.g. year range / status as androidtv shows them), Season, Episode and Person (born / died / birthplace or whatever androidtv shows). Movies stay exactly as now.
   - `detailsInfoItems(item, opts)`: Series → first item "Seasons" = `ChildCount` (androidtv), then Runs/Ends as now. Person → `[]` (androidtv shows none). Others as now.
   - `detailsTitles(item)` → `{title: string; subtitle?: string}` for the header: Episode → title = episode name, subtitle = `episodeFullName(item)` from `items.ts` (e.g. "Lost S1 E2"); Season → title = season name, subtitle = series name; others → name only.
   - `peopleToCards(item, api, kinds?)`: optional `PersonKind[]` filter (episodes show only `GuestStar`s). Without it, unchanged.
   - `seasonPlayTarget(episodes)` → `BaseItemDto | undefined`: the first episode not played (by order), else the first episode. The page then uses `resumePositionMs(target)` to show Resume or Play.
   - `seriesShowsResume(series, nextUp)` → boolean: androidtv's `handleResumeButtonAndFocus` rule for series (started and not finished, or the next-up episode has a position).

## Tests
- `test/api/tvDetails.spec.ts`: every fetcher calls the right SDK method with the right params (mock the `get*Api` functions like `test/api/details.spec.ts`), previous-episode picking (first, middle, last, single episode), next-episodes disabled without season/index, hooks disabled when signed out.
- `test/api/details.spec.ts`: toggles now invalidate `detailsKeys.all`.
- `test/api/itemInfo.spec.ts`: info row per new type, Seasons info item, person → no info items, `detailsTitles` per type (episode without series name, season without series name), guest-star filter, `seasonPlayTarget` (none played, some played, all played, empty), `seriesShowsResume` cases.

## Checks
- `npm run lint` (0 errors; baseline 40 warnings), `npx tsc --noEmit`, `npm test`. No build or simulator check: nothing renders these yet.

## Rules
- Source files: `src/api/tvDetails.ts`, `src/api/details.ts`, `src/api/itemInfo.ts`. Tests as listed. Nothing else.
- Commit to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported API (exact signatures) 7.5c/7.5d will use
- what you took from androidtv (and anything deliberately different, e.g. the adjacentTo check)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
