# Task 3a-1: startup flow and session gate

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03a1 (branch `task/03a1-session-gate`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

This is the first of five task-3 subtasks. Later subtasks build the real auth screens:
- 3a-2: AddServer
- 3a-3: UserPicker
- 3b-1: Password and QuickConnect
- 3b-2: Settings account section

This subtask adds the session state, the launch screen and the navigation gate. It registers the auth routes with **minimal placeholder screens**, which the later subtasks replace.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/auth/SessionContext.tsx`**: a `SessionProvider` and a `useSession()` hook.
   - **Status:** `'loading' | 'signedIn' | 'needsServer' | 'needsUser'`.
   - **State:**
     - `session?: Session`
     - `serverId?: string`, the server the picker should show
     - `notice?: {kind: 'expired' | 'offline'; message: string}`
   - **Actions:**
     - `signIn(session)`
     - `signOut()`: calls `authService.logout`, then goes to `needsUser` on the same server.
     - `switchUser()`: keeps the token and goes to `needsUser`.
     - `retry()`: runs the startup again.
     - `selectServer(serverId)`
   - **Startup**, from `AuthStore.getState()`:
     - No servers: go to `needsServer`.
     - `autoLogin.mode === 'disabled'`: go to `needsUser` on `lastServerId`, or on the most recently used server.
     - `lastUser`: use `lastServerId`/`lastUserId`. `specificUser`: use that server and user. If the chosen user has no token, go to `needsUser`.
     - Otherwise call `restoreSession(serverId, userId)`:
       - Returns a session: go to `signedIn`.
       - Returns `undefined` (token rejected): go to `needsUser` with an `expired` notice: "Your saved login for <name> has expired. Sign in again."
       - Throws a network error: go to `needsUser` with an `offline` notice: "Can't reach <server name>." The user approved going to the picker with a Retry action here.
   - **Dependencies** (an `AuthService` and an `AuthStore`) are injectable through provider props and default to `getAuthService()`/`getAuthStore()`, so tests can mock them.
2. **`src/screens/auth/LaunchScreen.tsx`**: the Sail icon (`src/assets/caravela-icon.png`), the name "Caravela" and an ActivityIndicator on the theme background. It is shown while `status === 'loading'`.
3. **`src/navigation/RootNavigator.tsx` + `src/navigation/types.ts`**:
   - Wrap the app in `SessionProvider`. Use React Navigation's conditional screens pattern:
     - `loading`: Launch.
     - Not signed in: the auth routes `AddServer`, `UserPicker {serverId}`, `Password {serverId, username?, userId?}` and `QuickConnect {serverId, userId?}`. `needsServer` starts at AddServer; `needsUser` starts at UserPicker.
     - `signedIn`: the existing `Main` + `DetailsPlaceholder`.
   - Pressing Back on the first auth screen must exit the app; check how Vega's BackHandler/`exitApp` behaves. Pressing Back elsewhere pops the stack.
   - The auth routes use one small placeholder component defined inline in `RootNavigator.tsx`. It shows the route name and a FocusableButton, so the gate can be exercised. The later subtasks replace it with the real screens.

## Tests (Jest, in `test/auth/`)
- **SessionContext**, with the service and store mocked:
  - Auto-login succeeds.
  - The token is expired, giving `needsUser` and the expired notice.
  - There are no servers yet, giving `needsServer`.
  - The server is offline, giving `needsUser`, the offline notice, and `retry()` re-running the startup.
  - Auto-login is disabled.
  - `specificUser` without a token.
  - `signOut` calls logout and lands on `needsUser`.
  - `switchUser` keeps the token.
- **RootNavigator:** it renders Launch, then the right first screen for each status.
- Keep the existing 63 tests passing. The existing `App.spec.tsx` may need the session mocked to `signedIn`.

## Checks
- `npm run lint` (0 errors), `npm test`, then `npm run build:release`.
- On the TV, inside `flock /tmp/caravela-device.lock -c '…'` (see HANDOFF.md):
  - Install and launch.
  - Take a screenshot. With no saved server it should land on the AddServer placeholder.
  - Save the screenshot to `docs/screenshots/03a1-first-run.png`, downscaled.

## Rules
- Only 4 source files: `SessionContext.tsx`, `LaunchScreen.tsx`, `RootNavigator.tsx` and `types.ts` (types only). Add tests as needed. Don't touch `authService.ts` or `store.ts`.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot path
- edge cases and suggested tests
- anything unresolved
