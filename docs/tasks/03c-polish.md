# Task 3c: sign-in polish (focus ring, disabled button, keyboard title)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03c (branch `task/03c-polish`, from `main`).
Background: read docs/HANDOFF.md and the briefs docs/tasks/03a2-add-server.md and 03a3-user-picker.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** these three fixes. Don't ask again for approval of the overall approach.

**Two other agents run at the same time:**
- 3b-1 (Password and Quick Connect) in `../caravela-wt/task-03b1` edits `RootNavigator.tsx` and `types.ts`.
- 3b-2 (Settings) in `../caravela-wt/task-03b2` edits `SettingsScreen.tsx`.

Stay inside the file scope below.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **User tile focus ring (`src/screens/auth/UserPickerScreen.tsx`).**
   - **The bug:** on the TV, **every** avatar shows a cyan-looking ring, so the focused tile is hard to tell apart. Only the focused name turns white.
   - **Likely cause:** `styles.avatar` has a transparent `borderWidth` border, and the avatar's `backgroundColor` (the initials colour) shows through it, so a cyan-ish avatar colour looks like a ring. Confirm the cause first.
   - **Bug rule: write a reproducing test first.** For example, an unfocused tile with an image must have no visible border/background ring, and only the focused tile gets `colors.focus`. Then fix it. Possible fixes:
     - Use the background colour only when showing the initials.
     - Or put the ring on an outer wrapper.
   - **Focus look:** keep it consistent with FocusableCard: a cyan ring plus the scale on the focused tile, and nothing on the others.
2. **A disabled state for `src/components/FocusableButton.tsx`.**
   - Add an optional `disabled?: boolean` prop. When it's set:
     - Pressing does nothing.
     - `accessibilityState.disabled` is true.
     - The button looks dimmed (lower opacity or muted colours from the theme).
   - Decide whether it stays focusable. On TV, a disabled button that still takes focus while busy is usually fine and avoids focus jumping; pick one, follow the Vega focus guidance, and explain why.
   - Add tests: `test/FocusableButton.spec.tsx` if it doesn't exist.
3. **AddServer (`src/screens/auth/AddServerScreen.tsx`).**
   - Use `disabled` on Connect while connecting. Keep the existing guard against repeat presses.
   - Set the Vega keyboard title to "Server address" instead of "Enter". The 3a-2 agent found `auxOptions="title:…"`. Check the exact prop in the Vega TextInput docs (Amazon Devices MCP, `search_documentation`, `target_platform` vega_os) before using it.
   - Update `test/auth/AddServerScreen.spec.tsx`.

## Checks
- `npm run lint` (0 errors), `tsc --noEmit`, `npm test`, then `npm run build:release`.
- **On the TV**, inside `flock /tmp/caravela-device.lock -c '…'` per step (see HANDOFF.md). The 3b-1 agent is also using the TV and will be waiting for the user to approve a Quick Connect code at some point.
  - **Before installing, read the current screen** (take a screenshot). If it shows a Quick Connect code, or the 3b-1 agent hasn't finished its device check, wait and retry later. Don't install over it mid-check.
  - Install your build and launch. On AddServer, open the keyboard and check that the title reads "Server address". Type `jellyfin.example.lan` with `inputd-cli send_text`, then connect and check that Connect looks disabled while connecting.
  - On the picker, move the focus between the tiles and check that only the focused tile has the ring.
  - **Don't select a user and don't log in.**
  - Screenshots (960 px wide): `docs/screenshots/03c-keyboard.png`. Keep the picker screenshot in the scratchpad only: it shows real people's photos, so **don't commit it**.

## Rules
- Source files: `FocusableButton.tsx`, `AddServerScreen.tsx`, `UserPickerScreen.tsx`. Add tests as needed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the root cause of the ring
- the test count
- the lint/build/install result
- the screenshot path
- edge cases and suggested tests
- anything unresolved
