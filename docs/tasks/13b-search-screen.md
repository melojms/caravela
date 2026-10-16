# Task 13b: Search screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-13b (branch `task/13b-search-screen`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R3, minimal Search = task 13). Task 13a (merged) added `src/api/search.ts`; this task replaces the Search placeholder with the real screen. Checks run on the **simulator** with the official Jellyfin demo server (the user's choice).

## What 13a gives you (`src/api/search.ts`)
- `SEARCH_GROUPS`: `movies` "Movies" (Movie), `shows` "Shows" (Series), `episodes` "Episodes" (Episode), in screen order.
- `useSearch(term): SearchGroupResult[]`, with `SearchGroupResult = SearchGroup & {query: UseQueryResult<BaseItemDto[]>}`. The array keeps its identity when nothing changed. An empty (trimmed) term fetches nothing and `data` is `undefined`. While a new term loads, each group shows its last results with `isPlaceholderData` true. 401s already expire the session.
- `useSearch` does **not** debounce: the screen does.
- Episode search matches the **episode's own title**, not the series name (same as androidtv): "pioneer" finds Pioneer One under Shows only; "Earthfall" finds an episode.

## Approach (approved)
Rewrite `src/screens/SearchScreen.tsx` (no longer uses `PlaceholderScreen`), modelled on androidtv's `ui/search/SearchFragment.kt` (reference clone `../ref/jellyfin-androidtv/`) and on `src/screens/HomeScreen.tsx` for rows.
- `ScreenContainer toolbar="search"`, `testID="search-screen"` (kept: `test/App.spec.tsx` uses it). **Focus on open stays on the toolbar's Search button** (the user chose this): no auto-focus on the field, the keyboard only opens when the user presses Enter on the field. So `focusToolbar` stays true and the field must not take preferred focus.
- **Field:** Kepler's `TextInput` under the toolbar, styled like the one in `src/screens/auth/AddServerScreen.tsx` (focus ring, placeholder "Search movies, shows and episodes"; reuse its `submitAction` handling). Down from the toolbar lands on it.
  - Typing: the term passed to `useSearch` settles **600 ms** after the last change (androidtv's debounce). Export the delay constant for the tests.
  - Submit: search right away (skip the debounce) and **move focus to the first card of the first row with results**. androidtv notes Amazon otherwise keeps the full-screen keyboard open and soft-locks the app, so check this on the simulator. If there are no results yet, focus moves once they arrive, or stays on the field when there are none.
- **Rows:** one `ContentRow` per group with results, in `SEARCH_GROUPS` order: Movies and Shows `poster`, Episodes `landscape`, cards from `toCardItem` (map each group's data once per fetch, as Home does with its `WeakMap`, so the Carousels don't re-render on focus). Groups with no items are hidden. Pressing a card opens `Details` (`{itemId, title}`), like Home's `openDetails`.
- **States:**
  - empty term: the hint text "Search movies, shows and episodes";
  - first load for a term with nothing to show yet: a spinner (`ActivityIndicator`, `colors.cyan`);
  - all groups done and empty: `No results for “<term>”`;
  - a group that failed (not a 401): a row with its title, "Couldn't load this row." and Retry, like Home's error rows;
  - while `isPlaceholderData`, keep showing the old rows (no spinner).
- **Focus:** Up from the first row goes to the field; Up from the field goes to the toolbar; Down from the field goes to the rows. Back from Details must land back on the card that was opened with the term and results still there (the screen stays mounted under Details). Check whether Vega does this by itself; if not, copy the smallest part of Home's restore (native tag + `FocusManager.focus` after a short delay) that makes it work. Say what you found.
- Out of scope: search history, voice, people, collections, the backdrop.

## Scope (only this)
`src/screens/SearchScreen.tsx`, `test/screens/SearchScreen.spec.tsx` (new). If `test/App.spec.tsx` needs a small mock update for the new screen, that's a third file. Leave `PlaceholderScreen.tsx` (delete it only if nothing else uses it, and say so). Plus README.md (see Checks).

## Tests (write them first and see them fail)
Mock `useSearch` (or the SDK, your choice; say which) and use Jest fake timers for the debounce.
- Opens with the hint and no request; the toolbar's Search button is the preferred focus, not the field.
- Typing sends the trimmed term to `useSearch` only after 600 ms; each keystroke restarts the delay.
- Submitting searches right away.
- Rows show in order with the right variants; empty groups are hidden; pressing a card navigates to `Details` with the id and title.
- Spinner on first load; "No results for “x”"; a failed group shows Retry, which refetches only that group; a 401 shows no error row.
- Old rows stay while the next term loads.
- Clearing the field goes back to the hint.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored).
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- **Simulator** (rules in `docs/HANDOFF.md` "Gotchas": `flock /tmp/caravela-sim.lock`, input via `-s emulator-5554`, screenshots with ImageMagick from the host, typing with `inputd-cli send_text` after focusing the field and waiting ~3 s). `run-app` wipes storage, so add the demo server `demo.jellyfin.org/stable` and sign in as `demo` with an empty password. Don't change anything on the demo server: it's public and shared.
  1. Home → toolbar Search: the Search button is focused, no keyboard.
  2. Down → field → Enter: the keyboard opens. Type `pioneer`, submit: the keyboard closes, focus is on the Pioneer One card in Shows.
  3. Enter on it: its Details page. Back: Search again, same card focused, term still there.
  4. Up to the field, replace the term with an episode title from Pioneer One (e.g. `Earthfall`): the Episodes row shows it. Also try a movie title from the demo server's library.
  5. A term with no matches (e.g. `zzzxq`): "No results for “zzzxq”".
  6. Clear the field: the hint comes back. Back from Search returns to Home.
  Screenshots of 2, 3 (back on Search), 4 and 5, kept in the scratchpad (not the repo). Check the keyboard doesn't stay open or soft-lock after submit.
- README.md: add Search to the Features/Status lists (minimal: movies, shows, episodes; no voice or history) and commit it on the branch. No new screenshot in the repo unless it's from the demo server at full size (see "Full-size captures"); if you take one, say so.

## Report
What you built, focus findings (submit → results, Back from Details), test results, simulator results with screenshot paths, anything surprising.

## Rules
- Only the files in Scope (plus this brief and README.md). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
