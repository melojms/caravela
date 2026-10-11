# Task 6a: library grid data (items query, saved sort and filters)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-06a (branch `task/06a-library-data`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful files under `app/src/main/java/org/jellyfin/androidtv/`:
- `ui/browsing/BrowseGridFragment.java` (sort options ~line 159, `setStatusText` ~line 311, filters and prefs ~line 660–720)
- `ui/itemhandling/ItemRowAdapter.java` + `ItemRowAdapterHelper.kt` (the grid's `getItems` request: fields, image types, paging, `nameStartsWith`)
- `preference/LibraryPreferences.kt`, `preference/store/DisplayPreferencesStore.kt` and `../../../../preference/src/main/kotlin/store/` (how prefs are keyed and how enum values are written)
- `data/repository/ItemRepository.kt` (`itemFields`)

**Another agent runs at the same time:**
- 6b (UI parts) in `../caravela-wt/task-06b` adds `src/components/LibraryHeader.tsx`, `src/components/LetterPicker.tsx` and changes `src/components/PosterGrid.tsx`. **Don't touch those.**
- The shared types are already on `main` in `src/api/libraryTypes.ts`: `LibraryKind`, `LibrarySortOption`, `LIBRARY_SORT_OPTIONS`, `LibraryFilters`, `LibraryPrefs`, `DEFAULT_LIBRARY_PREFS`, `LIBRARY_LETTERS`, `LibraryQuery`. **Don't change that file**; if a type doesn't fit, say so in the report.
- 6c (later) builds `src/screens/LibraryScreen.tsx` from your hooks and 6b's components. The screen gets `{libraryId, title, collectionType, displayPreferencesId}` as route params.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Use Context7 for the TanStack Query v5 docs (`useInfiniteQuery`, `initialPageParam`, `getNextPageParam`, `select`, optimistic `setQueryData` in mutations).

## Scope (only this)
1. **`src/api/library.ts`** (new), following the patterns in `src/api/home.ts` and `src/api/details.ts` (`useSession()`, keys including `serverId`/`userId`, `skipToken` when signed out, 401 handled by the existing query client):
   - `LIBRARY_PAGE_SIZE = 60` (10 rows of 6).
   - `fetchLibraryPage(api, userId, {libraryId, kind, query, startIndex})` → `{items: BaseItemDto[]; total: number}` via `getItemsApi().getItems`: `parentId`, `includeItemTypes` Movie for movies / Series for tvshows, `recursive: true`, `sortBy: [query.sortBy, SortName]` (no duplicate when sorting by name), `sortOrder: [query.sortOrder]`, `filters` `IsUnplayed` / `IsFavorite` from `query.filters`, `startIndex`, `limit`, `enableTotalRecordCount: true`, and the fields / image options androidtv's grid request uses (enough for `toCardItem` poster cards).
   - Letter: `nameStartsWith: letter` like androidtv; `#` sends `nameLessThan: 'A'` instead (jellyfin-web's behaviour), no `nameStartsWith`.
   - `libraryKeys` (`all(serverId, userId)`, `items(serverId, userId, libraryId, query)`, `prefs(serverId, userId, displayPreferencesId)`).
   - `useLibraryItems(libraryId, kind, query)`: `useInfiniteQuery`, page param = `startIndex`, next page while loaded < total (and the last page wasn't empty, so a shrinking library can't loop). Expose cards (`toCardItem(item, api, {variant: 'poster'})`) flattened across pages, `total`, plus `fetchNextPage` / `hasNextPage` / `isFetchingNextPage` / status / `refetch`. Guard against `fetchNextPage` being called again while a page is in flight (FlatList calls `onEndReached` repeatedly).
   - `libraryStatusText(folderName, query, sortOptions)` → androidtv's `setStatusText` sentence, e.g. "Showing all items from 'Movies' sorted by Name", "Showing unwatched favorites beginning with those whose name starts with B from 'Movies' sorted by Date added". Keep androidtv's wording, but clean up its double spaces.
2. **`src/api/libraryPrefs.ts`** (new):
   - Stored like androidtv's `LibraryPreferences`: `getDisplayPreferenceApi`, `displayPreferencesId` = the library's `DisplayPreferencesId`, **client `jellyfin-androidtv`**, `CustomPrefs` keys `SortBy`, `SortOrder`, `FilterFavoritesOnly`, `FilterUnwatchedOnly`. The user wants these shared with the official app, so **check exactly how androidtv writes enum and boolean values** (Kotlin enum `name` like `SORT_NAME` vs the API's `SortName`) and write the same; read both spellings.
   - `parseLibraryPrefs(customPrefs, kind)` → `LibraryPrefs`; a missing or unknown sort (not in `LIBRARY_SORT_OPTIONS[kind]`) → `DEFAULT_LIBRARY_PREFS`' sort. The order comes from the sort option, like androidtv.
   - `useLibraryPrefs(displayPreferencesId, kind)`: read errors fall back to defaults, except a 401, which is rethrown (like `fetchHomeSections`).
   - `useSaveLibraryPrefs(displayPreferencesId, kind)`: mutation. Update the cached prefs first (the grid re-queries immediately), then `updateDisplayPreferences` with the whole DTO from the last read and the merged `CustomPrefs` (keep other keys, e.g. androidtv's `PosterSize`). Send `userId` if 1.0.0 needs it. A failed save keeps the local choice and doesn't show an error (androidtv only logs it); a 401 still goes through the existing handler.

## Tests
- `test/api/library.spec.ts`: request params for each sort / filter combination, movies vs shows item types, `#` vs a letter vs none, paging params and the end-of-paging rule (including an empty page before `total`), a repeated `fetchNextPage` while one is in flight makes one request, status text for every filter/letter combination, keys include server/user/library/query.
- `test/api/libraryPrefs.spec.ts`: parse defaults, androidtv-written values, API-spelled values, unknown sort, booleans; save merges `CustomPrefs` and keeps other keys, sends the right client and id; read error → defaults; 401 → rethrown; optimistic update and no rollback on a failed save.
- Mock the `get*Api` functions like `test/api/home.spec.ts`.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`. No build or simulator check needed: nothing renders these yet.
- Optional, read-only: against the test server (address in docs/LOCAL.md) as `demo`, call `getItems` once with your params for a Movies library to confirm `total` and the `#` filter work; don't write prefs for `demo`.

## Rules
- Source files: `src/api/library.ts`, `src/api/libraryPrefs.ts`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.
- Never commit the server address.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported API (signatures) 6c will use
- what you took from androidtv (and anything deliberately different), including the exact enum/boolean encoding in `CustomPrefs`
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
