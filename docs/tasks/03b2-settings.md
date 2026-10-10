# Task 3b-2: Settings account section

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03b2 (branch `task/03b2-settings`, from `main`).
Background: read docs/HANDOFF.md, docs/PLAN.md and the earlier task-3 briefs in docs/tasks/ (03a1, 03a3) first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Two other agents run at the same time:**
- 3b-1 (Password and Quick Connect) in `../caravela-wt/task-03b1` edits `RootNavigator.tsx` and `types.ts`.
- 3c (polish) in `../caravela-wt/task-03c` edits `FocusableButton.tsx`, `AddServerScreen.tsx` and `UserPickerScreen.tsx`.

Stay inside the file scope below.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/screens/SettingsScreen.tsx`** replaces the placeholder with an **Account** section.
   - Use `ScreenContainer`, keep the `settings-screen` testID, and use the theme tokens.
   - **Signed in as:** the user name, the server name and the server address, from `useSession().session`.
   - **Switch user** calls `useSession().switchUser()`, which shows the picker and keeps the saved token.
   - **Sign out** calls `useSession().signOut()`.
     - It goes to the picker even if logout fails; that's already in SessionContext.
     - It rethrows the error, so **catch it**: no unhandled rejection. Log it with `console.warn`.
     - Ignore repeat presses while it runs.
   - **Auto-login**, shown as three FocusableButtons with `active` on the selected one (the same pattern as the menu):
     - **Off:** `{mode: 'disabled'}`.
     - **Last user:** `{mode: 'lastUser'}`.
     - **Only <user name>:** `{mode: 'specificUser', serverId, userId}` for the current session.
     - Read the current value from `authStore.getState().autoLogin` on mount, and save it with `authStore.setAutoLogin(...)`.
     - If the saved value is `specificUser` for a different user, show it as "Only <that user's name>" (look the name up in the state) as a fourth, active option, so the user can see it before changing it.
     - If saving fails, revert the selection and show "Couldn't save the setting."
   - Take `authStore` as an optional prop, defaulting to `getAuthStore()`, for tests.
   - D-pad: focus moves vertically between the rows and horizontally inside the auto-login row. Keep the first focus on the left of the screen, near the menu; check how the other menu screens hand focus over from the side menu.
   - Room for later sections (playback, display) isn't needed yet. Just put the account section under a section heading.
2. Only if the theme lacks a needed token, add it to `src/theme/tokens.ts`. Otherwise this is a one-file change.

## Tests
- `test/SettingsScreen.spec.tsx`, with the session and store mocked:
  - Shows the user, the server name and the address.
  - Switch user calls `switchUser`.
  - Sign out calls `signOut`. A rejected sign-out is caught (no unhandled rejection), and repeat presses are ignored.
  - The auto-login value loads from the store and each option saves the right value.
  - A `specificUser` for another user shows the extra option.
  - A failed save reverts and shows the message.
- Keep all existing tests passing, including any App/RootNavigator test that renders Settings.

## Checks
- `npm run lint` (0 errors), `tsc --noEmit`, `npm test`, then `npm run build:release`.
- **No device check in this subtask:** reaching Settings needs a real sign-in, which 3b-1 adds. The lead checks Settings on the TV when merging. Don't install on the TV; the other agents are using it.

## Rules
- Source files: `SettingsScreen.tsx`, plus `tokens.ts` only if needed. Add tests as needed. Don't touch `SessionContext.tsx`, `store.ts` or the navigator.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build result
- edge cases and suggested tests
- anything unresolved
