# Task 5c-2: wire real data into Home

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-05c2 (branch `task/05c2-home-wiring`, from `main`).
Background: read docs/HANDOFF.md, then docs/tasks/05a-items.md and docs/tasks/05b-home-queries.md (both merged: `src/api/items.ts`, `src/components/Backdrop.tsx`, `src/api/home.ts`, `src/api/queryClient.tsx`). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Look and feel: match the official jellyfin-androidtv app.** When in doubt, read how it's done there: clone at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only; port, don't copy). Under `app/src/main/java/org/jellyfin/androidtv/`: `ui/home/HomeRowsFragment.kt` (rows, item selected → background), `ui/home/HomeFragmentViewsRow.kt` (My Media cards), `data/service/BackgroundService.kt` (backdrop timing: 800 ms transition), `ui/background/AppBackground.kt`.

**Two other agents run at the same time:**
- 5c-1 (401 → picker) in `../caravela-wt/task-05c1` edits `src/auth/SessionContext.tsx` and `src/api/queryClient.tsx`. **Don't touch those.** You don't need to handle 401s in Home; 5c-1 does it globally.
- app-pill in `../caravela-wt/task-app-pill` edits `assets/` only, and also uses the TV.

## Setup
- Run `npm ci` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/screens/HomeScreen.tsx`**
   - Rows in the order from `useHomeSections()`: `myMedia` → "My Media" (landscape, library cards), `resume` → "Continue Watching" (landscape, `preferParentThumb`), `nextUp` → "Next Up" (landscape, `preferParentThumb`), `latest` → one "Latest <library name>" row per library from `latestLibraries(...)` (poster). Use androidtv's row titles.
   - Map items with `toCardItem` (5a). Memoise per row so Carousels don't re-render on every focus change.
   - **States:** while sections load, a centred spinner. A row with no items is hidden. A row that fails (non-401) shows its title, a short message and a Retry `FocusableButton` (calls that query's `refetch`). All rows loaded and empty → "Nothing here yet" text.
   - **Focus:** the first row that has items gets `hasPreferredFocus` once data arrives (don't steal focus later when another row loads). Pressing a card still opens `DetailsPlaceholder`.
   - **Backdrop:** render `<Backdrop>` behind the rows. When a card gets focus, show its first `backdropUris` entry after the focus settles (debounce ~300 ms so fast scrolling doesn't fetch every backdrop); no backdrop → clear it. Same behaviour as androidtv's `ItemViewSelectedListener` → `BackgroundService.setBackground`.
   - **Refresh:** refetch the Home queries when the Home screen regains focus (React Navigation `useFocusEffect`/`focus` event), respecting the 30 s `staleTime`.
   - Stop using `src/dev/mockItems.ts` here (Movies still uses it; don't delete it).
2. **`src/components/ContentRow.tsx`**: add `onItemFocus?: (item: CardItem) => void`, plus whatever the error state needs (e.g. an optional `error` / `onRetry`, or render the error inside HomeScreen instead; choose the simpler).
3. **`src/components/renderCard.tsx`**: pass `onFocus` through to `FocusableCard` (which already has `onFocus`).

## Tests
- `test/HomeScreen.spec.tsx` (new; mock the `src/api/home.ts` hooks): sections order respected; empty rows hidden; error row with Retry calls `refetch`; all-empty message; spinner while loading; Latest rows per library with the right titles; focus on a card updates the backdrop after the debounce (fake timers); pressing a card navigates.
- `test/ContentRow.spec.tsx`: `onItemFocus` fires with the item.
- Keep all existing tests green.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV** (see HANDOFF.md "Shared Fire TV"; hold `flock /tmp/caravela-device.lock -c '…'` for the whole flow, including while waiting for the code):
  - Take a screenshot first; if another agent is mid-check, wait and retry.
  - `run-app` wipes storage: add `jellyfin.example.lan` (type with `inputd-cli send_text`), pick `melojms`, start Quick Connect. **Print the code in your output and ask the user to approve it** in the Jellyfin dashboard, then wait. **Never use a password.**
  - Check: rows appear in the server's order with real artwork; card text matches androidtv; the backdrop changes (and is **blurred**; 5a couldn't confirm blur renders on Vega, so look closely and report) when you move between cards; D-pad up/down between rows and into the side menu works.
  - Screenshots (960 px wide): `docs/screenshots/05c2-home.png` (top of Home, a card focused, backdrop visible) and `docs/screenshots/05c2-home-latest.png` (scrolled to a Latest row). Library artwork is fine to commit; **don't commit anything showing avatar photos**.
  - **Don't sign out at the end.**

## Rules
- Source files: `HomeScreen.tsx`, `ContentRow.tsx`, `renderCard.tsx`. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the files changed
- whether blur renders on the TV
- what you took from androidtv (and anything deliberately different)
- the test count and lint/build/install result, screenshot paths
- edge cases and suggested tests
- anything unresolved
