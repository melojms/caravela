# Handoff

Read this file and docs/PLAN.md before starting. Last updated 2026-10-10.

## Status
- **Done and merged to `main`:**
  - Task 1: scaffold, Sail icon, manifest, GPL-2.0, README.
  - Task 2: `@jellyfin/sdk` 1.0.0 client, address discovery, saved servers/users/tokens, password and Quick Connect services.
  - Task 3: sign-in, split into subtasks with briefs in `docs/tasks/03*.md`:
    - 3a-1 `SessionContext` + launch screen + session gate. The auth stack shows until someone signs in. Offline or expired notices go to the picker; a failed load shows Retry on the launch screen.
    - 3a-2 add-server screen, plus a `not-jellyfin` discovery error.
    - 3a-3 user picker (saved and public users, avatars with `api_key` when a token is saved).
    - 3b-1 Quick Connect (the default) and Password screens.
    - 3b-2 Settings account section: switch user, sign out, auto-login off / last / specific user.
    - 3c focus ring on user tiles, a `disabled` prop on FocusableButton, keyboard title.
  - Task 4: side menu (Home / Movies / Shows / Search / Settings), theme, FocusableCard / ContentRow / PosterGrid / FocusableButton, with mock data in `src/dev/mockItems.ts`.
- **Checks on `main`:** lint shows 0 errors, Jest has 189 passing tests, and the Release build installs and runs on the Fire TV.
  - The full sign-in flow was checked on the TV: add server, picker, Quick Connect, Home, Settings, auto-login after a restart, switch user, sign out.
  - The TV is currently signed out.
- **Next: 3d, sign-in follow-ups. The user has APPROVED the approach below** (2026-10-10). Start it directly; don't ask for approval again.
  - **Setup:** two subtasks in parallel. Each gets its own worktree, brief (`docs/tasks/03d1-*.md`, `docs/tasks/03d2-*.md`) and herdr pane. Their file scopes don't overlap.
  - **3d-1: Quick Connect and Password.** Worktree `../caravela-wt/task-03d1`, branch `task/03d1-quick-connect`.
    - `src/auth/authService.ts`:
      - Add `isQuickConnectEnabled(serverId)` using the SDK's Quick Connect API `getQuickConnectEnabled`, with no token.
      - Add `expiresAt: number` (epoch ms) to `QuickConnectAttempt`, set by `startQuickConnect` from its `timeoutMs`.
      - **Decision:** the service owns the timeout. The screen doesn't export or duplicate the default.
    - `src/screens/auth/QuickConnectScreen.tsx`:
      - The countdown reads `attempt.expiresAt`. Remove the screen's own `timeoutMs` prop and default.
      - Use `FocusableButton disabled` while busy, instead of dropping `onPress`.
    - `src/screens/auth/PasswordScreen.tsx`:
      - Call `isQuickConnectEnabled` on mount and show "Use Quick Connect" only when it returns true.
      - If the check fails, keep the button hidden; sign-in must still work.
      - The Sign in button uses `disabled` while signing in.
    - **Tests:**
      - The service: enabled, disabled, network error, `expiresAt`.
      - The countdown follows `expiresAt` (fake timers).
      - Password hides or shows the button for each of enabled / disabled / failed.
      - The disabled states.
      - Update `test/auth/fakes.ts`.
    - **On the TV:** screenshots of the Quick Connect screen (pick `melojms`, then Cancel without approving) and the Password screen (via "Use password"; never type or submit a password). No sign-in is needed.
  - **3d-2: clearer selected state.** Worktree `../caravela-wt/task-03d2`, branch `task/03d2-active-style`.
    - `src/components/FocusableButton.tsx`: when `active` but not focused, give it a violet outline (`colors.violet`, `focus.borderWidth`) and a white label, so the selected auto-login option in Settings stands out. Leave the focused style as it is.
    - **Decision:** this applies everywhere `active` is used, **including the side menu** (Home / Movies / …). The user approved that.
    - **Tests:** the active, focused, active+focused and disabled style combinations.
    - **On the TV:** screenshots of the Settings auto-login row (unfocused, with the selection visible) and the side menu.
      - This needs a sign-in. The TV is signed out, so **ask the user to approve one Quick Connect code** in the Jellyfin dashboard. Print the code and wait.
      - Don't sign out at the end.
      - Don't commit screenshots that show avatar photos.
  - **Merge order:** 3d-2 first (one file), then rebase 3d-1 onto it and merge. Follow "Before merging to `main`" below.
  - **Then task 5, Home rows.** Describe the approach and wait for approval.

- **Follow-ups:**
  - The Movies grid needs top padding while scrolling: the previous row's year labels show at the top.
  - Home doesn't remember the last-focused card: it focuses the first card after you come back.
  - Add tests for repeated `onEndReached` calls, the end of paging, and progress values ≤0 or ≥1.
  - Two saved servers with the same name make the "Only <user> on <server>" label ambiguous.
  - The user picker doesn't reload when you come back to it; a pending `restoreSession` still signs in after you leave.
  - Discovery can't tell a TLS failure from "offline"; both show the unreachable message.

## Decisions and preferences
- **App:** name **Caravela**, package `com.melojms.caravela`, icon concept B "Sail" (`assets/brand/caravela-icon.svg`). Licence GPL-2.0. Unofficial; works with Jellyfin.
- **Scope:** movies and TV shows only. No Live TV or music. English only.
  - Deferred: UDP server discovery (the user types the server address) and websocket remote control.
- **Jellyfin:** 12.0+ (the test server `https://jellyfin.example.lan` runs 12.2) with `@jellyfin/sdk` 1.0.0. Storage is Vega's async-storage. Tokens are unencrypted for now, which the user accepted.
- **Login:** test user `melojms`. **Never ask for or use the password**; use Quick Connect and the user approves it.
- **UI:** the side menu changes section on press, not on focus.
- **User rules** (see also `~/.claude/CLAUDE.md`):
  - Describe the approach and wait for approval before coding.
  - Split work that touches more than 3 files into smaller tasks.
  - List edge cases and suggested tests after coding.
  - For bugs, write a reproducing test first.
  - Use `git switch -c`.
  - Commits have no Co-Authored-By or Claude-Session trailers.
  - Don't push or open PRs unless asked.
  - Prefer herdr panes over hidden subagents.

## How we work
- **One task, one worktree:** `git worktree add -b task/NN-name ../caravela-wt/task-NN main`. Write the brief at `docs/tasks/NN-*.md` inside that worktree.
- **Start the agent in a herdr pane:**
  - `herdr pane split w3:p1 --direction right --cwd <worktree> --no-focus`
  - `herdr agent start <name> --kind claude --pane <id> -- "Read docs/tasks/NN-*.md and execute it end to end. The user already approved the approach for this task."`
  - Wait with `herdr agent wait <pane> --until done --until idle` (run it in the background). Read results with `herdr pane read <pane> --source recent`.
- **Parallel work:** two independent tasks can run at once. Keep each brief's file scope separate.
- **Shared Fire TV** (`192.168.50.124:5555`): every install, launch, input or screenshot runs inside `flock /tmp/caravela-device.lock -c '…'`.
  - When agents run in parallel, hold the lock for a whole flow (install → navigate → screenshot), not per step. Otherwise agents interleave on the TV.
  - **Typing:** focus the TextInput (the keyboard opens), wait about 3 s, then `inputd-cli send_text <text>`. Check with a screenshot: a stray key press can add a letter in front. Press Back to close the keyboard.
- **Before merging to `main`:**
  - Rebase onto `main` and resolve `package.json`, `manifest.toml` and `jest.config.json` by taking both sides.
  - Delete and regenerate `package-lock.json` with `npm install`.
  - Run `npm run lint` and `npm test`, then `npm run build:release`.
  - Install and launch: `vega run-app build/armv7-release/caravela_armv7.vpkg com.melojms.caravela.main -d 192.168.50.124:5555`.
  - `run-app` reinstalls the package, which **wipes the app's storage** (saved servers, users and tokens). To restart without losing them, e.g. to check auto-login: `vega device terminate-app -d 192.168.50.124:5555 -a com.melojms.caravela.main`, then `vega device launch-app` with the same options.
  - Take a screenshot (below) and look at it.
  - Then `git merge --ff-only`.
- **Screenshot:**
  - `vega exec vda -s 192.168.50.124:5555 shell gwsi-tool-screenshooter /tmp/x.png`, then `vega exec vda -s … pull /tmp/x.png <scratchpad>/x.png`.
  - Downscale it with PIL before viewing (the TV captures at 4K).
- **Remote input:** `vega exec vda -s … shell inputd-cli button_press KEY_UP` (also KEY_BACK, KEY_DOWN, …).
  - The TV screensaver swallows the first key presses. If a screenshot shows artwork, press Back and run `run-app` again.

## Gotchas
- **Debug builds** load JavaScript from Metro (`npm start` plus port forwarding); without it the app starts blank. Use **Release** builds for checks on the TV.
- **Jest:** the Vega preset's stand-ins for BackHandler and Dimensions are wrong for RN 0.83. `test/setup.tsx` replaces them, and `test/jestSetup.js` sets up the API tests. Both are listed in `jest.config.json` `setupFiles`.
- **Manifest:** the build adds `[[needs.module]]` entries for each native package it uses. Keep them when merging.
- **Untracked files:** the Amazon Builder Tools create an untracked `CLAUDE.md` and `.claude/skills/` in the repo. Leave them uncommitted.
- **Vega CLI:** read `vega_cli_commands_reference.md` (Amazon Devices MCP) before using new Vega CLI commands.
- **Playback** (task 8+): the research notes are in docs/PLAN.md under "Playback design". Use Shaka 4.16.13-r1.2 for HLS. ASS and PGS subtitles must be burned in by the server.
