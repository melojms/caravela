# Task 13a: search queries

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-13a (branch `task/13a-search-api`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R3, minimal Search = task 13). Task 13b (next, after this one merges) builds `src/screens/SearchScreen.tsx` on the hook from this task. No device check in this task: it's data only.

## Why
The toolbar's Search opens a placeholder, and Appstore reviewers reject features that don't work. Minimal search: a term over movies, series and episodes, results as rows of cards.

## Approach (approved)
Port androidtv's `SearchRepository` / `SearchViewModel` (reference clone: `../ref/jellyfin-androidtv/app/src/main/java/org/jellyfin/androidtv/ui/search/`), limited to three groups.

New file `src/api/search.ts`, in the style of `src/api/home.ts`:
- `SEARCH_LIMIT = 25`.
- `fetchSearch(api, userId, term, kind)`: `getItemsApi(api).getItems({userId, searchTerm: term, includeItemTypes: [kind], limit: SEARCH_LIMIT, recursive: true, imageTypeLimit: 1, fields: <the browse fields>, enableTotalRecordCount: false})`, returns `Items ?? []`. Reuse `BROWSE_FIELDS` from `home.ts` by exporting it there (that's the third file; keep the change to the export only).
- `searchKeys`: `['search', serverId, userId, kind, term]`, so the cache is per user like Home.
- `SEARCH_GROUPS`: Movies (`BaseItemKind.Movie`), Shows (`BaseItemKind.Series`), Episodes (`BaseItemKind.Episode`), in that order, each with a stable `key` (`movies` / `shows` / `episodes`) and a `title` ("Movies", "Shows", "Episodes").
- `useSearch(term)`: trims the term; for each group, a query via `useQueries` (one per group, run in parallel), with `skipToken` when the trimmed term is empty or nobody is signed in. Use `placeholderData: keepPreviousData` (check the TanStack Query v5 API through Context7) so the rows don't empty while the next term loads. Return one entry per group: `{key, title, kind, query}` where `query` exposes at least `data`, `isPending`, `isError`, `error`, `refetch`, `isPlaceholderData` (13b needs these for the spinner, "No results", Retry). Keep the returned array stable across renders when nothing changed (13b passes the cards to Carousels, which shouldn't re-render on focus).
- **No debouncing here.** The screen (13b) debounces (600 ms, androidtv) and passes the settled term.
- 401s: nothing special; the shared client's `onError` already expires the session. Check that's still true for these queries.

## Scope (only this)
`src/api/search.ts` (new), `test/api/search.spec.ts` (new), `src/api/home.ts` (export `BROWSE_FIELDS` only).

## Tests (write them first and see them fail)
Follow `test/api/home.spec.ts` for the mocked SDK and session.
- `fetchSearch` sends the parameters above (term, kind, limit, recursive, fields, imageTypeLimit, no total count) and returns `[]` when the server sends no `Items`.
- `useSearch('')` and `useSearch('   ')` fetch nothing.
- `useSearch(' spider ')` fetches the three kinds with the trimmed term, and returns the groups in order with their data.
- Changing the term keeps the previous data (`isPlaceholderData` true) until the new one arrives.
- One group failing leaves the other two with data.
- Signed out: no fetch.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored).
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`).
- Optional but useful: one real call against the demo server (`https://demo.jellyfin.org/stable`, user `demo`, empty password) with curl, to confirm the parameters return Pioneer One for "pioneer" in Shows and Episodes. Read-only; change nothing there.

## Report
What you built, the exact exported API of `src/api/search.ts` (13b's brief is written from it), test results, anything surprising.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
