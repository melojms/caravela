# Task 6c-1: the Library screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-06c (branch `task/06c-library-screen`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app** (`/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv`, read-only): `app/src/main/java/org/jellyfin/androidtv/ui/browsing/BrowseGridFragment.java` is the screen you're building.

## What's already on `main` (don't change these files)
- `src/api/libraryTypes.ts`: `LibraryKind`, `LIBRARY_SORT_OPTIONS`, `LibraryPrefs`, `LibraryQuery`, `LIBRARY_LETTERS`.
- `src/api/library.ts` (6a): `useLibraryItems(libraryId, kind, query | undefined)` → `{cards, total, fetchNextPage, hasNextPage, isFetchingNextPage, status, isPending, isError, error, refetch}` (`undefined` query disables it; `fetchNextPage` is safe to call repeatedly), `libraryStatusText(folderName, query, sortOptions)`, `libraryKeys`.
- `src/api/libraryPrefs.ts` (6a): `useLibraryPrefs(displayPreferencesId, kind)` (`data` = `LibraryPrefs`, defaults on read errors), `useSaveLibraryPrefs(displayPreferencesId, kind)` (`mutate(prefs)` with the whole `LibraryPrefs`; updates the cache first).
- `src/components/LibraryHeader.tsx` (6b): `title`, `statusText`, `focusedName?`, `focusedIndex?` (0-based), `total?`, `filters`, `letter?`, `showLetterButton`, `onSortPress`, `onToggleUnwatched`, `onToggleFavorites`, `onLetterPress`.
- `src/components/LetterPicker.tsx` (6b): `selected?`, `onSelect(letter)`, `onClose`.
- `src/components/PosterGrid.tsx` (6b): adds `onItemFocus(item, index, tag)`. It keeps the top row in a ref, so **remount it (a `key` built from the query) when sort, filters or letter change**.
- `src/components/TrackPicker.tsx`: reuse it as the Sort by picker (map the sort options to `{index, label}`; `selectedIndex` = the current option).
- Read the 6a/6b briefs in `docs/tasks/06a*.md`, `06b*.md` and the code for details.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (otherwise `tsc` fails).

## Scope (only this)
1. **`src/navigation/types.ts`**: add `Library: {libraryId: string; title: string; collectionType: LibraryKind; displayPreferencesId: string}`. Leave `Movies`/`Shows` for now (6c-2 removes them).
2. **`src/screens/LibraryScreen.tsx`** (new), `RootStackScreenProps<'Library'>`:
   - `ScreenContainer` without the toolbar (like Movies today), `LibraryHeader` on top, `PosterGrid` below.
   - Prefs: wait for `useLibraryPrefs` before the first items request (pass `undefined` until then). The query = saved prefs + a local `letter` state (not saved).
   - Sort: the Sort button opens `TrackPicker` titled "Sort by" with `LIBRARY_SORT_OPTIONS[collectionType]`; picking saves `{...prefs, sortBy, sortOrder}` and closes it. Switching away from Name clears the letter (androidtv hides the letter button then).
   - Unwatched / Favorites toggles save the new filters.
   - Letter: the button (only when sorting by Name) opens `LetterPicker` with the current letter; picking the current letter again clears it; picking closes the picker.
   - When a picker closes, focus goes back to the button that opened it.
   - Header: status text from `libraryStatusText(title, query, options)`; focused item's name and index from `onItemFocus`; `total` from the query. Reset the focused name/index when the query changes.
   - Grid: `focusFirstItem` on open and after each query change (fixes "Movies and Shows open with nothing focused"); `onEndReached` → `fetchNextPage`; a small spinner row or indicator while `isFetchingNextPage`.
   - States: first-load spinner; error with a Retry button (`refetch`; 401s already go to the picker through the query client); empty → "No items found" (with a hint to clear filters/letter when any are on).
   - Press: movies → `navigation.navigate('Details', {itemId, title})`; tvshows → `DetailsPlaceholder` (series details come later).
   - Back from Details: refocus the last focused card like `HomeScreen` (`useFocusEffect`, `FocusManager.focus(tag)` after `RESTORE_FOCUS_DELAY_MS`-style delay; skip the first focus). Also refetch stale library queries then (a favourite/played toggle in Details changes them). If the card is gone, focus the first card.
3. **`src/components/renderCard.tsx`**: show the progress bar only for `progress > 0` (6b found negative progress draws an empty bar; its test in `test/PosterGrid.spec.tsx` is `it.failing` — switch it to `it`).

## Tests
- `test/LibraryScreen.spec.tsx` (mock the 6a hooks; see how `test/HomeScreen.spec.tsx` / `DetailsScreen.spec.tsx` mock theirs): waits for prefs; sort pick saves and remounts the grid; switching off Name clears the letter and hides the button; filters save; letter select / reselect clears / Back closes; status text and counter; spinner, error + Retry, empty with and without filters; movie press → Details, series press → DetailsPlaceholder; `onEndReached` calls `fetchNextPage` (repeated calls are fine); refocus after returning.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No simulator check yet: nothing navigates to `Library` until 6c-2. **Don't use the Fire TV.**

## Rules
- Source files: `src/navigation/types.ts`, `src/screens/LibraryScreen.tsx`, `src/components/renderCard.tsx`. Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering: files changed, decisions (anything different from androidtv), test count and lint result, edge cases and suggested tests, anything unresolved.
