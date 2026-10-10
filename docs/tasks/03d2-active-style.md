# Task 3d-2: clearer selected (`active`) state on FocusableButton

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03d2 (branch `task/03d2-active-style`, from `main`).
Background: read docs/HANDOFF.md (section "Next: 3d") and the brief docs/tasks/03c-polish.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Another agent runs at the same time:**
- 3d-1 (Quick Connect and Password) in `../caravela-wt/task-03d1` edits `authService.ts`, `QuickConnectScreen.tsx`, `PasswordScreen.tsx` and their tests. It uses FocusableButton's existing `disabled` prop, so **don't change the props API**.

Stay inside the file scope below.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
- **`src/components/FocusableButton.tsx`**: when `active` and **not** focused, give the button a violet outline (`colors.violet`, `focus.borderWidth` from the theme) and a white label, so the selected auto-login option in Settings stands out.
  - Leave the focused style as it is (focused wins over active).
  - Keep the layout stable: the button must not change size or shift when it becomes active/focused (e.g. keep a transparent border of the same width in the base style).
  - Disabled keeps its dimmed look; decide what disabled+active shows and explain why.
- **Decision:** this applies everywhere `active` is used, **including the side menu** (Home / Movies / …). The user approved that.

## Tests
- `test/FocusableButton.spec.tsx`: the style for active, focused, active+focused and disabled (and disabled+active) combinations, plus the label colour.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV** (see HANDOFF.md "Shared Fire TV"): hold `flock /tmp/caravela-device.lock -c '…'` for the **whole** flow (install → navigate → screenshots) so the 3d-1 agent doesn't interleave. The 3d-1 agent also installs builds on the TV.
  - **Before installing, take a screenshot.** If the 3d-1 agent is mid-check (Quick Connect or Password screen it opened), wait and retry later.
  - `run-app` wipes storage: add the server `jellyfin.example.lan` (type with `inputd-cli send_text`, see HANDOFF.md "Typing"), pick `melojms`, start Quick Connect.
  - **This needs a sign-in.** Print the Quick Connect code in your output and **ask the user to approve it** in the Jellyfin dashboard, then wait. **Never use a password.** Keep holding the lock while waiting so 3d-1 doesn't reinstall over you; if that's impractical, release it and tell the user.
  - Screenshots (960 px wide):
    - `docs/screenshots/03d2-settings-auto-login.png`: the Settings auto-login row with the selected option visible and **not** focused.
    - `docs/screenshots/03d2-side-menu.png`: the side menu with the active section.
  - **Don't sign out at the end.** Don't commit screenshots that show avatar photos.

## Rules
- Source file: `FocusableButton.tsx` only. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot paths
- edge cases and suggested tests
- anything unresolved
