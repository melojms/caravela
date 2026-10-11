# Task 6c-2: wire the Library screen in, remove the mocks, simulator check

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-06c (branch `task/06c-library-screen`, on top of 6c-1).
Background: docs/HANDOFF.md, docs/PLAN.md, and `docs/tasks/06c1-library-screen.md` (what 6c-1 built).
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

## Scope (only this)
1. **`src/navigation/RootNavigator.tsx`**: register `Library` → `LibraryScreen`; remove the `Movies` and `Shows` screens.
2. **`src/navigation/types.ts`**: remove the `Movies` and `Shows` routes.
3. **`src/screens/HomeScreen.tsx`**: My media cards open `Library` with `{libraryId: item.Id, title: item.Name, collectionType, displayPreferencesId: item.DisplayPreferencesId ?? item.Id}`. Keep the `BaseItemDto` per library (today `libraryTypes` only keeps the collection type). Other cards keep opening details as today.
4. Delete `src/screens/MoviesScreen.tsx`, `src/screens/ShowsScreen.tsx` and their tests, and `src/dev/mockItems.ts` if nothing else uses it (`git grep` first; keep `PlaceholderScreen` if something else uses it). Update tests that navigate to `Movies`/`Shows` (e.g. `test/HomeScreen.spec.tsx`).

## Tests
- Home: a Movies and a TV library card navigate to `Library` with the right params (and the `DisplayPreferencesId` fallback).

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **Simulator only. Don't use the Fire TV.** Follow HANDOFF "Gotchas → Vega Virtual Device" (start it if needed, `flock /tmp/caravela-sim.lock`, `run-app` with the x86_64 release vpkg, input via `-s emulator-5554`, screenshots with ImageMagick `import` of the simulator window, kept in your scratchpad). Sign in as `demo` with an empty password.
- Walk through and screenshot:
  1. Home → My media → Movies: header (title, status line, counter), first card focused, no half rows at the top.
  2. Scroll down past 60 items (next page loads; the demo Movies library has 76), and back up.
  3. Up to the buttons: Sort by → Date added (order changes, status text updates); back to Name.
  4. Unwatched on, then Favorites on, then both off (status text; empty state if nothing matches).
  5. Letter → B (only names starting with B), Letter → B again (cleared); `#`.
  6. Open a movie → Details → Back: the same card is focused.
  7. Back → Home. Then Home → My media → Shows: series grid; press a series → placeholder.
  8. Leave and reopen Movies: the sort/filters you left are restored (they're saved on the server for `demo`; set them back to Name / no filters at the end).
- Report anything that looks off (focus jumps, the grid's row-aligned scrolling fighting Vega's own scroll, slow paging).

## Rules
- Source files: the three above plus the deletions. Tests as needed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.
- Never commit the server address or screenshots.

## Done = report back
Files changed, what each walkthrough step showed (attach screenshot paths in the scratchpad), test count and lint/build results, edge cases and suggested tests, anything unresolved.
