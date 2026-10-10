# Task 5b: Home queries (TanStack Query, section order, row data)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-05b (branch `task/05b-home-queries`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** When in doubt, read how it's done there. A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the logic, don't copy code). Useful files under `app/src/main/java/org/jellyfin/androidtv/`:
- `ui/home/HomeRowsFragment.kt` (section → row mapping), `ui/home/HomeFragmentHelper.kt` (resume / next-up requests), `ui/home/HomeFragmentLatestRow.kt` (latest per library, exclusions), `ui/home/HomeFragmentViewsRow.kt` (My Media)
- `preference/UserSettingPreferences.kt` and `constant/HomeSectionType.kt` (the `homesection0..9` keys and their defaults)

**Another agent runs at the same time:**
- 5a (item → card mapping, Backdrop) in `../caravela-wt/task-05a` adds `src/api/items.ts`, `src/components/Backdrop.tsx` and edits `src/components/types.ts`. **Don't touch those.** This task returns raw `BaseItemDto`s; 5c maps them to cards.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **Add `@tanstack/react-query`** (current v5). **Use Context7 first** to read the current TanStack Query v5 React docs (provider, `useQuery`, `useQueries`, `focusManager`/refetch, `queryClient.clear`). Check it works with React 19. Pure JS, so no Vega native module is involved; confirm the Release build still bundles.
2. **`src/App.tsx`**: wrap the app in a `QueryClientProvider`.
   - **The cache must not leak between users:** when the signed-in user (or server) changes or signs out, start from an empty cache (e.g. a client keyed on `serverId:userId`, or `queryClient.clear()` on change). Pick one and explain.
   - Defaults: `staleTime` ~30 s, `retry` 1, **no retry on 401**, `refetchOnWindowFocus` off (there's no window; 5c refetches when Home regains focus).
3. **`src/api/home.ts`** (new):
   - **Section order.** `fetchHomeSections(api, userId)`: read DisplayPreferences `usersettings` for client `emby` (what jellyfin-web and androidtv share) and its `CustomPrefs.homesection0..9`. Missing prefs or keys → androidtv's defaults (`smalllibrarytiles, resume, resumeaudio, resumebook, livetv, nextup, latestmedia, none, none, none`). Map to our sections and **drop** what we don't support:
     - `smalllibrarytiles` / `librarybuttons` → `myMedia`; `resume` → `resume`; `nextup` → `nextUp`; `latestmedia` → `latest`; everything else (`resumeaudio`, `resumebook`, `livetv`, `activerecordings`, `none`, unknown) → dropped. No duplicates.
     - A pure `parseHomeSections(customPrefs)` for testing.
   - **Row fetchers** (each takes `api`, `userId`, returns `BaseItemDto[]`, **limit 20**, `fields` and `imageTypeLimit: 1`/`enableImageTypes` as androidtv does, `enableTotalRecordCount: false` where supported):
     - `fetchMyMedia`: `getUserViews`; keep only `CollectionType` `movies` and `tvshows`.
     - `fetchResume`: `getResumeItems`, `mediaTypes: [Video]`, excluding audiobooks like androidtv.
     - `fetchNextUp`: `getNextUp`, `enableResumable: false` (like androidtv; the item is already in Continue Watching).
     - `fetchLatest(api, userId, libraryId)`: `getLatestMedia`, `parentId`, `groupItems: true`.
     - `latestLibraries(views, user)`: the movie/tvshows views minus `user.Configuration.LatestItemsExcludes`.
   - **Query keys and hooks** for 5c: `homeKeys` (all keys include `serverId` and `userId`), plus `useHomeSections`, `useMyMedia`, `useResume`, `useNextUp`, `useLatest(libraryId)` thin wrappers over `useQuery`. They read `api`/user from `useSession()` (`src/auth/SessionContext.tsx`; don't change that file).
   - `isUnauthorized(error)`: true for an HTTP 401 from the SDK (axios) error. 5c uses it to send the user to the picker.

## Tests
- `test/api/home.spec.ts`:
  - `parseHomeSections`: defaults when missing, a custom order, unknown and unsupported values dropped, duplicates removed, `librarybuttons` → `myMedia`.
  - Each fetcher calls the right SDK API with limit 20 and the right params (mock the SDK `get*Api` functions; follow the existing patterns in `test/auth/authService.spec.ts` and `test/jestSetup.js`).
  - `fetchMyMedia` filters to movies/tvshows; `latestLibraries` honours `LatestItemsExcludes`.
  - `isUnauthorized` for 401, 500, a network error and a non-axios error.
- `test/App.spec.tsx`: still passes; add a case that the cache doesn't carry over to another user if practical.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV** (see HANDOFF.md "Shared Fire TV", inside `flock /tmp/caravela-device.lock -c '…'` for the whole flow): install and launch, and check the app still starts on Add Server (the provider must not break startup). One screenshot in the scratchpad is enough; nothing to commit. **No sign-in.**

## Rules
- Source files: `package.json` (+ lock), `src/App.tsx`, `src/api/home.ts`. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the TanStack Query version
- how the cache is reset between users
- what you took from androidtv (and anything deliberately different)
- the test count and lint/build/install result
- edge cases and suggested tests
- anything unresolved
