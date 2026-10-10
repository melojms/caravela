# Task 5c-1: a 401 mid-session sends the user to the picker

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-05c1 (branch `task/05c1-unauthorized`, from `main`).
Background: read docs/HANDOFF.md, then docs/tasks/05b-home-queries.md and docs/tasks/03a1-session-gate.md. Platform: Vega OS, React Native 0.83 / React 19, TanStack Query v5.
The user has **already approved** this approach (decision: "picker on 401"). Don't ask again for approval of the overall approach.

**Two other agents run at the same time:**
- 5c-2 (Home wiring) in `../caravela-wt/task-05c2` edits `src/screens/HomeScreen.tsx`, `src/components/ContentRow.tsx`, `src/components/renderCard.tsx`. **Don't touch those.**
- app-pill in `../caravela-wt/task-app-pill` edits `assets/` and docs only.

## Setup
- Run `npm install` first (or `npm ci`). The worktree has no `node_modules`.

## Scope (only this)
1. **`src/auth/SessionContext.tsx`**: add `expireSession(): void` to the context.
   - It moves to the picker for the current server (status `needsUser`, `serverId` = the session's server) with the existing `expired` notice (`Your saved login for <user> has expired. Sign in again.`; reuse the startup wording/helper).
   - It **drops the saved token** for that user (the server already rejected it), so auto-login doesn't loop back into a dead token on the next start. Keep the user in the saved list. Check how `signOut` / the store remove a token and reuse that; don't call the server's logout (the token is already invalid).
   - It's idempotent: several queries failing at once must only expire once. A call when not signed in does nothing.
2. **`src/api/queryClient.tsx`**: when any query (and mutation, for later tasks) fails with `isUnauthorized(error)` (from `src/api/home.ts`), call `expireSession()`. Use the TanStack `QueryCache`/`MutationCache` `onError` (check the v5 docs with Context7). The client is created per session in `SessionQueryClientProvider`, so wire `expireSession` in there without recreating the client on every render.
   - Non-401 errors are untouched (rows show their own error).

## Tests
- `test/auth/SessionContext.spec.tsx`: `expireSession` goes to the picker with the expired notice, removes the token but keeps the user, is idempotent, and is a no-op when signed out.
- `test/api/queryClient.spec.tsx`: a 401 from a query calls `expireSession` once, even when two queries 401 together; a 500 doesn't.
- Keep all existing tests green.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV** (inside `flock /tmp/caravela-device.lock -c '…'` for the whole flow; other agents share the TV): install and check the app still starts on Add Server. No sign-in needed; the 401 flow is covered by tests. One scratchpad screenshot; nothing to commit.

## Rules
- Source files: `src/auth/SessionContext.tsx`, `src/api/queryClient.tsx`. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the files changed
- how the token is dropped
- the test count and lint/build/install result
- edge cases and suggested tests
- anything unresolved
