# Task 7a: movie details data (queries, toggles, info helpers)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-07a (branch `task/07a-details-data`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful files under `app/src/main/java/org/jellyfin/androidtv/`:
- `ui/itemdetail/FullDetailsFragment.java` (info items ~line 430, `getRunTime`/`getEndTime` ~line 700, buttons ~line 760, movie rows ~line 524)
- `ui/itemdetail/FullDetailsFragmentHelper.kt` (`toggleFavorite`, `togglePlayed`, `resumePlayback`)
- `ui/browsing/composable/inforow/BaseItemInfoRow.kt` (info row order and media badges; the details page passes `includeRuntime = false`), `rating.kt`
- `util/TimeUtils` (`formatMillis`), `data/repository/ItemRepository.kt` (`itemFields`)

**Another agent runs at the same time:**
- 7b (details UI components) in `../caravela-wt/task-07b` adds `src/components/DetailsHeader.tsx` and `src/components/DetailsActions.tsx`. **Don't touch those.**
- The view-model types you produce are already on `main` in `src/components/types.ts`: `InfoRowEntry`, `DetailsInfoItem`, `DetailsAction`, `CardItem`. **Don't change that file**; if a type doesn't fit, say so in the report.
- 7c (later) builds `src/screens/DetailsScreen.tsx` from your hooks/helpers and 7b's components.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Use Context7 for the TanStack Query v5 mutation docs (`useMutation`, optimistic updates with `onMutate`/`setQueryData`, rollback, `invalidateQueries`).

## Scope (only this)
1. **`src/api/details.ts`** (new), following the patterns in `src/api/home.ts` (`useSession()`, keys including `serverId`/`userId`, `skipToken` when signed out, 401 handled by the existing query client):
   - `fetchItemDetails(api, userId, itemId)`: `getUserLibraryApi().getItem` (or `getItemsApi` with `ids`, whichever 1.0.0 offers for a single item with user data). Ask for the fields the details page needs: Overview, Genres, People, MediaSources, MediaStreams, Taglines, Chapters, plus androidtv's `itemFields`.
   - `fetchSimilarItems(api, userId, itemId)`: `getLibraryApi().getSimilarItems`, limit 20 (check androidtv's `createSimilarItemsRequest` for its limit/fields and match them).
   - `detailsKeys` (`item`, `similar`) and hooks `useItemDetails(itemId)`, `useSimilarItems(itemId)`.
   - `useToggleFavorite(itemId)` and `useTogglePlayed(itemId)`: `getUserLibraryApi` `markFavoriteItem`/`unmarkFavoriteItem` and `getPlaystateApi` `markPlayedItem`/`markUnplayedItem`. Flip `UserData.IsFavorite` / `UserData.Played` (and clear the resume position when marking played, as the server does) in the cached item first, roll back on error, and on settle invalidate the item and `homeKeys.all(serverId, userId)` so Home is fresh when you go back.
2. **`src/api/itemInfo.ts`** (new), pure functions, no React:
   - `infoRowEntries(item, now?)` → `InfoRowEntry[]` in androidtv's movie order: community rating, critic rating, date (premiere date as a local medium date, else production year), age rating, then media badges from the default media source (`MediaSources[0]`): SDH / CC subtitle markers, resolution name (port `getResolutionName`: 4K, 1080p, 720p, SD, interlaced "i"), video range names (SDR, HDR10, HDR10+, HLG, Dolby Vision combos), audio codec name (Atmos / DTS:X / DTS-HD / DCA / AC3 / EAC3 / TrueHD / uppercase codec), audio channel layout uppercased. No runtime (the details page shows it under "Runs").
   - `detailsInfoItems(item, {now, use24Hour})` → `DetailsInfoItem[]`: "Directed by" (first Director in People, else "[Unknown]"), and when `RunTimeTicks` is set: "Runs" (androidtv's `getRunTime` format) and "Ends" (now + remaining runtime, i.e. runtime minus `PlaybackPositionTicks` when resumable). Format "Ends" with `formatClock` from `src/components/ToolbarClock.tsx` (import it; don't change that file).
   - `resumePositionMs(item, prerollMs = 0)` (undefined when not resumable) and `resumeLabel(ms)` → "Resume from 1:02:10" (androidtv's `formatMillis`). Pre-roll setting doesn't exist yet: default 0.
   - `peopleToCards(item, api)` → `CardItem[]` for Cast & crew: name as title, role as subtitle (or the person kind for crew such as Director/Writer), primary image via `imageUrl` from `src/api/items.ts` when `PrimaryImageTag` is set, placeholder colour otherwise. Same order as the server returns, like androidtv.
   - Ticks helpers if you need them (ms × 10000) — keep them in this file.

## Tests
- `test/api/details.spec.ts`: fetchers call the right SDK API with the right params (mock the `get*Api` functions like `test/api/home.spec.ts`); toggles call mark/unmark by current state, update the cache optimistically, roll back on error, invalidate item + Home keys.
- `test/api/itemInfo.spec.ts`: info row order; each badge mapping (resolution boundaries, interlaced, every video range, Atmos/DTS variants, channel layout); missing media source → no badges; date vs year fallback; "Directed by" unknown; Runs/Ends with and without a resume point, 12 h and 24 h; resume label formatting (< 1 h, ≥ 1 h, 0); people with and without images.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`. No build or simulator check needed: nothing renders these yet.

## Rules
- Source files: `src/api/details.ts`, `src/api/itemInfo.ts`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported API (signatures) 7c will use
- what you took from androidtv (and anything deliberately different)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
