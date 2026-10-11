# Task 6b: library grid UI parts (header, letter picker, grid focus)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-06b (branch `task/06b-library-ui`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the look, don't copy code). Useful files under `app/src/main/`:
- `res/layout/horizontal_grid_browse.xml` (title, status line, focused item name, counter, toolbar of icon buttons)
- `java/org/jellyfin/androidtv/ui/browsing/BrowseGridFragment.java` (toolbar buttons ~line 720–830, `JumplistPopup` ~line 833, the counter in the selected listener)
- `java/org/jellyfin/androidtv/ui/AlphaPickerView.kt`, `res/layout/view_button_alpha_picker.xml`
- `res/drawable/ic_sort.xml`, `ic_unwatch.xml`, `ic_heart.xml`, `ic_jump_letter.xml` (vector paths; draw them with `@amazon-devices/react-native-svg` like `src/components/detailsIcons.tsx`)

**Another agent runs at the same time:**
- 6a (data) in `../caravela-wt/task-06a` adds `src/api/library.ts` and `src/api/libraryPrefs.ts`. **Don't touch those.**
- The shared types are on `main` in `src/api/libraryTypes.ts` (`LibraryFilters`, `LibrarySortOption`, `LIBRARY_LETTERS`, …). **Don't change that file**; if a type doesn't fit, say so in the report.
- 6c (later) builds `src/screens/LibraryScreen.tsx`: header on top, `PosterGrid` below, the sort picker (it reuses `TrackPicker`), and the letter picker. Your components are presentational: props in, callbacks out, no data fetching.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- Read the Vega focus docs via the Amazon Devices MCP / skills (`amazon-devices-vega-focus-management`): `TVFocusGuideView` (`autoFocus`, `trapFocus*`), `hasTVPreferredFocus`.

## Scope (only this)
1. **`src/components/LibraryHeader.tsx`** (new):
   - Left: library `title`, `statusText` (a string 6a builds), and the focused item's name. Right: the counter "`index` | `total`" (1-based, androidtv style; hidden when nothing is focused or total is unknown) and a row of round icon buttons: Sort, Unwatched, Favorites, Letter (only when `showLetterButton`).
   - Unwatched and Favorites show their on state like `FocusableButton`'s `active` outline (violet, see 3d-2), and the Letter button is `active` while a letter is set. Focused buttons look like the details action buttons (`src/components/DetailsActions.tsx`); reuse the theme tokens.
   - Props (adjust names if needed, report them): `title`, `statusText`, `focusedName?`, `focusedIndex?`, `total?`, `filters: LibraryFilters`, `letter?`, `showLetterButton`, `onSortPress`, `onToggleUnwatched`, `onToggleFavorites`, `onLetterPress`, `testID`.
   - Wrap the button row in a `TVFocusGuideView` with `autoFocus`, so Up from the grid lands on the last focused button and Down goes back to the grid.
2. **`src/components/LetterPicker.tsx`** (new): androidtv's jump-list popup.
   - A horizontal strip of the 27 `LIBRARY_LETTERS` across the top of the screen, over the content. Focus starts on `selected` (or `#` when none) and is trapped in the strip.
   - Props: `selected?`, `onSelect(letter)`, `onClose`, `testID`. Back closes it through its own `BackHandler` listener, like `src/components/TrackPicker.tsx`. Mark the selected letter like `active`.
   - Picking a letter just calls `onSelect`; the screen decides that picking the current letter again clears it.
3. **`src/components/PosterGrid.tsx`** (change):
   - `onItemFocus?(item, index, tag)` (renderCard's `onFocus` gives the native tag), for the header's name/counter and for refocusing after Back the way `HomeScreen` does.
   - Fix the HANDOFF follow-up "The Movies grid needs top padding while scrolling: the previous row's year labels show at the top": scrolled rows must not show above the first fully visible row (clip the list's area, or keep the focused row below a top inset). Keep the fixed row heights (`getItemLayout`).
   - `focusFirstItem` keeps working; check how a focused card's scale fits in the first row and the leftmost column.

## Tests
- `test/LibraryHeader.spec.tsx`: texts, counter shown/hidden, Letter button only when allowed, each button calls its callback, on/off states (testIDs or accessibility state).
- `test/LetterPicker.spec.tsx`: 27 letters, initial focus on the selected letter or `#`, select calls back, Back closes (and the listener is removed on unmount).
- `test/PosterGrid.spec.tsx`: `onItemFocus` gets item, index and tag. Also the HANDOFF follow-up: progress values ≤0 and ≥1 on a card (no bar at 0; a full bar, not overflowing, at ≥1). If that's a bug, write the failing test first and fix it only if the fix is in your files; otherwise report it.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No simulator check needed: no screen uses these yet (6c does the visual check). **Don't use the Fire TV.**

## Rules
- Source files: `src/components/LibraryHeader.tsx`, `src/components/LetterPicker.tsx`, `src/components/PosterGrid.tsx`. Tests as listed. Nothing else (icons go in `LibraryHeader.tsx`).
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the exported props 6c will use
- what you took from androidtv (and anything deliberately different)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
