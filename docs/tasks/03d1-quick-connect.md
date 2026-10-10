# Task 3d-1: Quick Connect and Password follow-ups

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03d1 (branch `task/03d1-quick-connect`, from `main`).
Background: read docs/HANDOFF.md (section "Next: 3d") and the brief docs/tasks/03b1-signin.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Another agent runs at the same time:**
- 3d-2 (active style) in `../caravela-wt/task-03d2` edits `src/components/FocusableButton.tsx` and `test/FocusableButton.spec.tsx`. **Don't touch those two files.** You only use the existing `disabled` prop.

Stay inside the file scope below.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/auth/authService.ts`**
   - Add `isQuickConnectEnabled(serverId): Promise<boolean>` using the SDK's Quick Connect API `getQuickConnectEnabled`, called **without** a token (it's a public endpoint). Let errors reject; the caller decides what to do.
   - Add `expiresAt: number` (epoch ms) to `QuickConnectAttempt`. `startQuickConnect` sets it from its `timeoutMs` (default `DEFAULT_QUICK_CONNECT_TIMEOUT_MS`).
   - **Decision:** the service owns the timeout. The screen doesn't export or duplicate the default.
2. **`src/screens/auth/QuickConnectScreen.tsx`**
   - The countdown reads `attempt.expiresAt`. Remove the screen's own `timeoutMs` prop and `DEFAULT_TIMEOUT_MS`.
   - Use `FocusableButton disabled` while busy, instead of dropping `onPress`.
3. **`src/screens/auth/PasswordScreen.tsx`**
   - Call `isQuickConnectEnabled` on mount; show "Use Quick Connect" only when it resolves `true`.
   - If the check rejects, keep the button hidden. Password sign-in must still work. Ignore results that arrive after unmount.
   - The Sign in button uses `disabled` while signing in (keep any existing repeat-press guard).

## Tests
- `test/auth/authService.spec.ts`: `isQuickConnectEnabled` enabled / disabled / network error; `expiresAt` = start time + `timeoutMs` (and the default).
- `test/auth/QuickConnectScreen.spec.tsx`: the countdown follows `expiresAt` (fake timers); the disabled state while busy.
- `test/auth/PasswordScreen.spec.tsx`: the Quick Connect button for enabled / disabled / failed; Sign in disabled while signing in.
- Update `test/auth/fakes.ts` (fake `isQuickConnectEnabled`, `expiresAt` on fake attempts).
- Bug rule doesn't apply here (these are features), but keep existing tests green.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV** (see HANDOFF.md "Shared Fire TV"): hold `flock /tmp/caravela-device.lock -c '…'` for the **whole** flow (install → navigate → screenshots) so the 3d-2 agent doesn't interleave.
  - **Before installing, take a screenshot.** If it shows a Quick Connect code or the 3d-2 agent is mid-check (it needs a signed-in session and will be waiting for the user to approve a code), wait and retry later. Don't install over it.
  - `run-app` wipes storage: add the server `jellyfin.example.lan` again (type it with `inputd-cli send_text`, see HANDOFF.md "Typing").
  - Pick `melojms` → Quick Connect screen shows a code and countdown → screenshot → **Cancel without approving**.
  - Open the Password screen via "Use password" → screenshot (check "Use Quick Connect" shows, since the server has it on). **Never type or submit a password.** No sign-in is needed.
  - Screenshots (960 px wide): `docs/screenshots/03d1-quick-connect.png`, `docs/screenshots/03d1-password.png`. Don't commit any screenshot that shows avatar photos.

## Rules
- Source files: `authService.ts`, `QuickConnectScreen.tsx`, `PasswordScreen.tsx`. Tests as listed. Run `npx prettier --write` on changed files if lint complains.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot paths
- edge cases and suggested tests
- anything unresolved
