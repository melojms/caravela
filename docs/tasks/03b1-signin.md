# Task 3b-1: password and Quick Connect screens

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03b1 (branch `task/03b1-signin`, from `main`).
Background: read docs/HANDOFF.md, docs/PLAN.md and the earlier task-3 briefs in docs/tasks/ (03a1, 03a2, 03a3) first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Two other agents run at the same time:**
- 3b-2 (Settings) in `../caravela-wt/task-03b2` edits `SettingsScreen.tsx`.
- 3c (polish) in `../caravela-wt/task-03c` edits `FocusableButton.tsx`, `AddServerScreen.tsx` and `UserPickerScreen.tsx`.

Stay inside the file scope below. Don't add a `disabled` prop to FocusableButton yourself; 3c adds it. Until it's merged, disable buttons by dropping `onPress`, the same way AddServer does.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/screens/auth/QuickConnectScreen.tsx`** for the route `QuickConnect {serverId, userId?}`. The user decided **Quick Connect is the default sign-in**.
   - **On mount:** call `authService.startQuickConnect(serverId)`.
   - **While it runs, show:**
     - Title "Sign in with Quick Connect".
     - The instructions: "On another device signed in to <server name>, open Settings → Quick Connect and enter this code."
     - The **code**, large and spaced (e.g. `typography.display`, letter spacing).
     - A countdown to the attempt's timeout (mm:ss). The default is 5 minutes; read the timeout from the service options.
     - Buttons: **Cancel**, which cancels and goes back, and **Use password**, which cancels and replaces the screen with `Password {serverId, userId, username}`. Get the username from the saved user or the public user list, or leave it out.
   - **Results:**
     - Success: `useSession().signIn(session)`.
     - `quick-connect-disabled`: replace with `Password` for the same user, and show "Quick Connect is turned off on this server." there (pass it as a route param, e.g. `notice`).
     - `quick-connect-timeout`: show "The code expired." and a **Try again** button that starts a new attempt.
     - Any other error: show the message and Try again.
   - **Leaving the screen** (Back, Cancel or unmount) calls `attempt.cancel()`. A session that resolves after the screen has gone must **not** call `signIn`.
     - That is the follow-up race from HANDOFF: Quick Connect cancelled while the login request is in flight. Write that test first.
   - Initial focus is on Cancel; the code itself isn't focusable.
2. **`src/screens/auth/PasswordScreen.tsx`** for the route `Password {serverId, userId?, username?, notice?}`.
   - **Layout:**
     - The username shown read-only when it's given. Otherwise a username `TextInput` ("Add user" from the picker, for hidden users).
     - A password `TextInput` with `secureTextEntry`.
     - A **Sign in** button.
     - A **Use Quick Connect** button when the server allows it. Just navigate to QuickConnect; if it's turned off there, that screen comes back here.
   - An **empty password is allowed**, for users with no password.
   - **Results:**
     - `loginWithPassword` resolves: `signIn(session)`.
     - `invalid-credentials`: "Wrong username or password."
     - A network error: "Can't reach <server name>."
     - Anything else: the generic "Something went wrong. Try again."
   - While signing in: disable the button, show "Signing in…", and ignore repeat submits.
   - Keyboard return keys: `next` from username to password, and `go` on the password field submits.
   - Look at how AddServerScreen handles the Vega TV keyboard and focus, and match it.
   - A `notice` param shows as a banner.
3. **`src/navigation/RootNavigator.tsx` + `types.ts`**:
   - Point `Password` and `QuickConnect` at the new screens.
   - Add `notice?: string` to the Password params.
   - Delete the now-unused `AuthPlaceholder` and its styles.
   - Don't touch the other screen lines.
- Both screens take `authService`/`authStore` as optional props, defaulting to `getAuthService()`/`getAuthStore()`, the same way the picker does.

## Tests
- **`test/auth/QuickConnectScreen.spec.tsx`:**
  - Shows the code.
  - The countdown ticks (use fake timers).
  - Success calls `signIn`.
  - Cancel and unmount call `cancel()`.
  - **A session that resolves after unmount does not sign in.**
  - Disabled replaces with Password and shows the notice.
  - A timeout shows Try again, which starts a new attempt.
  - Use password replaces with Password.
- **`test/auth/PasswordScreen.spec.tsx`:**
  - With and without a username.
  - An empty password submits.
  - Wrong credentials show the message.
  - A network error shows the message.
  - Repeat submits are ignored.
  - The notice shows.
  - Success calls `signIn`.
- **`test/auth/RootNavigator.spec.tsx`:** replace any placeholder assertions for these routes.
- Keep all existing tests passing.

## Checks
- `npm run lint` (0 errors), `tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV**, inside `flock /tmp/caravela-device.lock -c '…'` per step (see HANDOFF.md). Type text with `inputd-cli send_text <text>` while the keyboard is open.
  1. Install and launch. If it lands on AddServer, add `jellyfin.example.lan`.
  2. On the picker, select **melojms**. Quick Connect should show a code.
  3. **Stop and ask the user, in this pane**, to approve that code in the Jellyfin dashboard. Print the code clearly and wait for their reply. Don't hold the device lock while waiting.
  4. After they approve, it should land on Home. Take a screenshot to `docs/screenshots/03b1-home.png`.
  5. **Restart the app** (`run-app` again) and check that auto-login goes straight to Home.
  6. Take a screenshot of the Quick Connect screen too, at `docs/screenshots/03b1-quick-connect.png`.
- Screenshots should be downscaled to 960 px wide. Don't commit screenshots that show people's avatar photos.
- **Never ask for, type or use a password.** Check the Password screen with tests only; you may open it on the TV to screenshot it, but don't submit it.

## Rules
- Source files: `QuickConnectScreen.tsx`, `PasswordScreen.tsx`, `RootNavigator.tsx` and `types.ts` (types only). Add tests as needed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot paths
- edge cases and suggested tests
- anything unresolved
