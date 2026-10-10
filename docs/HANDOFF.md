# Handoff

Read this file and docs/PLAN.md before starting. Last updated 2026-10-10.

## Status
- **Done and merged to `main`:**
  - Task 1: scaffold, Sail icon, manifest, GPL-2.0, README.
  - Task 2: `@jellyfin/sdk` 1.0.0 client, address discovery, saved servers/users/tokens, password and Quick Connect services. There is no UI for these yet.
  - Task 4: side menu (Home / Movies / Shows / Search / Settings), theme, FocusableCard / ContentRow / PosterGrid / FocusableButton, with mock data in `src/dev/mockItems.ts`.
- **Checks on `main`:** lint shows 0 errors, Jest has 63 passing tests, and the Release build installs and runs on the Fire TV.
- **Next: task 3, sign-in screens.** The user hasn't approved it yet: describe the approach and wait for approval.
  - **3a:**
    - The splash becomes a launch screen while saved logins load.
    - If auto-login is on with a saved token: validate it (`getCurrentUser`) and go to Home. If the token is invalid, go to user selection with a message.
    - Add-server screen using the TV keyboard, with task 2's discovery and clear errors for unreachable and too-old servers.
    - User picker: saved users plus the server's public users, with avatars.
  - **3b:**
    - Password screen.
    - Quick Connect screen: shows the code, polls, has a cancel button.
    - Auto-login setting: off / last user / specific user.
    - Sign out and switch user in Settings.
    - The menu and Home appear only once someone is signed in.
  - **Tests:**
    - Component tests for each screen.
    - The startup flow with the auth service mocked: auto-login, expired token, no servers yet.
    - On the TV: add the server, pick `melojms`, log in with Quick Connect (the user approves it in the Jellyfin dashboard), then restart to check auto-login.
  - **Edge cases:** server offline at startup, Quick Connect turned off on the server, a user with no password, Back on the first-run screen exits, long names.
- **Follow-ups:**
  - The Movies grid needs top padding while scrolling: the previous row's year labels show at the top.
  - Home doesn't remember the last-focused card: it focuses the first card after you come back.
  - Add tests for repeated `onEndReached` calls, the end of paging, and progress values ≤0 or ≥1.
  - Add a test for the race where Quick Connect is cancelled while the login request is in flight.
  - Add a "not a Jellyfin server" error message.

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
- **Before merging to `main`:**
  - Rebase onto `main` and resolve `package.json`, `manifest.toml` and `jest.config.json` by taking both sides.
  - Delete and regenerate `package-lock.json` with `npm install`.
  - Run `npm run lint` and `npm test`, then `npm run build:release`.
  - Install and launch: `vega run-app build/armv7-release/caravela_armv7.vpkg com.melojms.caravela.main -d 192.168.50.124:5555`.
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
