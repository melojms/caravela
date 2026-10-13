# Task R1-c: refetch stale data when the app comes back to the foreground

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r1c (branch `task/r1c-foreground-refetch`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R1). Another agent is running task R2 at the same time in `../caravela-wt/task-r2`; it only touches `manifest.toml`, `package.json`, `scripts/build-release.sh` and the release workflow, and it uses the **Fire TV**. Use the **simulator** for this task's checks.

## Why
After the app sits in the background (Home, another app, the TV off overnight), the screen it comes back to shows whatever it had: a details page's Resume position, Home's Continue watching / Next up, watched and favourite state changed from another client. Today nothing refetches on return: `refetchOnWindowFocus: false` in `src/api/queryClient.tsx`, because "there is no window to refocus on a TV". Vega's React Native `AppState` gives us that signal (`active` / `background`, see https://developer.amazon.com/docs/vega/0.24/foreground-background.html). This also matters for R1-a (next): when the player leaves to the details page on background, the details page should refresh its Resume on return.

## Approach (approved)
TanStack Query v5's own mechanism (5.104 here; check its docs through Context7 for the current API): wire `focusManager` to `AppState`, and let the default `refetchOnWindowFocus` (refetch **stale** queries that have observers) do the rest.
- In `src/api/queryClient.tsx`: a small exported function (e.g. `listenToAppState()`) that calls `focusManager.setEventListener(handleFocus => { const sub = AppState.addEventListener('change', state => handleFocus(state === 'active')); return () => sub.remove(); })`, set up once. Call it from `SessionQueryClientProvider` in a `useEffect` with an empty dependency list, or another single place you find cleaner; say which and why. `focusManager` is global, not per client.
- Remove `refetchOnWindowFocus: false` (the default `true` only refetches stale queries; `staleTime` stays 30 s). Update the doc comment that says there is no window to refocus on.
- Leave the screens' own `useFocusEffect` refetches alone.
- Things to think through and note in the report: screens lower in the stack (Home under Details) still have observers and will refetch too, which is fine; infinite library queries refetch every loaded page; a 401 on return still expires the session through the existing `onError`; nothing should refetch while the app is in the background.

## Scope (only this)
`src/api/queryClient.tsx`, `test/api/queryClient.spec.tsx`. If the call site ends up elsewhere (e.g. `src/App.tsx`), that's a third file, no more.

## Tests (write them first and see them fail)
With `AppState` mocked (capture the `change` listener):
- a stale query with an observer refetches after `background` → `active`;
- a fresh query (inside `staleTime`) doesn't;
- going to `background` doesn't refetch anything;
- unmounting removes the `AppState` subscription (no leaks across remounts / scope changes);
- the existing scope and 401 tests still pass.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored).
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- **Simulator** (`VirtualDevice`, rules in `docs/HANDOFF.md` "Gotchas"; sign in as `demo` with an empty password on the Jellyfin demo server, or whichever server the simulator already has):
  1. Open a movie's details page. Send the app to the background with `vega exec vda -s <VirtualDevice serial> shell vmsgr send os://home` (check `vega device list` for the serial). Wait > 30 s. Toggle that movie's favourite with curl against the server as the same user (`POST`/`DELETE /UserFavoriteItems/{itemId}`, token from a login with curl). Bring the app back with `vmsgr send orpheus://com.melojms.caravela.main`. The Favourite button shows the new state without leaving the page. Toggle it back afterwards.
  2. Same with Home: background, mark something watched/unwatched with curl (`POST`/`DELETE /UserPlayedItems/{itemId}`) so a row changes, return: the row updates. Undo it afterwards.
  3. Return within 30 s: no refetch (say how you checked, e.g. the server's activity or a temporary log you remove before committing).
  Screenshots for 1 and 2.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge. Leave the demo server's data as you found it.

## Done = report back
Files changed, where `listenToAppState` is called and why, tests added and the count, lint/tsc/test/build results, pass/fail per simulator check with screenshot paths, the notes asked for above, anything odd.
