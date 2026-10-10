# Handoff

Read this file and docs/PLAN.md before starting. Last updated 2026-10-10 (after task 5.5).

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
    - 3d sign-in follow-ups, in parallel (`docs/tasks/03d*.md`):
    - 3d-1 Quick Connect only shows on Password when the server has it on (`isQuickConnectEnabled`). The countdown reads `attempt.expiresAt` (the service owns the timeout). Sign in and Try again use `disabled` while busy.
    - 3d-2 `active` FocusableButton (not focused) gets a violet outline, including the side menu. Disabled+active keeps the outline, dimmed.
  - Task 4: side menu (Home / Movies / Shows / Search / Settings), theme, FocusableCard / ContentRow / PosterGrid / FocusableButton, with mock data in `src/dev/mockItems.ts`.
  - Task 5: Home rows (briefs `docs/tasks/05*.md`):
    - 5a `src/api/items.ts` (items → cards, androidtv titles/subtitles: episode "Series S1 E2" + episode name, movie/series age rating; image fallbacks; local-time dates) and `src/components/Backdrop.tsx` (blurred, dimmed; blur confirmed on the TV).
    - 5b TanStack Query v5 with a per-user cache (`src/api/queryClient.tsx`, provider in `RootNavigator`) and `src/api/home.ts` (section order from `usersettings`/`emby` prefs with androidtv defaults, falls back to defaults on failure except 401; My media, Continue watching, Next up, Recently added per library, 20 items).
    - 5c-1 any 401 → `expireSession()`: picker with the expired notice, token dropped; late 401s from a previous user's client are ignored.
    - 5c-2 Home wired to real data, androidtv row titles, error rows with Retry, spinner, "Nothing here yet", focused-card backdrop (300 ms debounce), refetch on return.
  - App pill: the launcher shows only the middle 16:9 strip of `assets/image/app_icon.png`, so the icon is now Sail + "Caravela" on navy (`assets/brand/caravela-pill.svg`).
  - 5d: the card placeholder colour now sits inside the focus border, so unfocused cards have no frame.
  - Task 5.5: androidtv-style top toolbar instead of the side menu (briefs `docs/tasks/055*.md`).
    - 5.5a `src/components/Toolbar.tsx` + `ToolbarClock.tsx` (avatar, Home/Search, settings gear via `@amazon-devices/react-native-svg`, clock following the device 12/24 h via `@amazon-devices/react-native-localize`).
    - 5.5b the root stack holds Home / Search / Settings / Movies / Shows / DetailsPlaceholder directly; `ScreenContainer` takes `toolbar="home" | "search"`. Back pops; Back on Home exits the app.
    - 5.5c-2 removed the bottom-tabs dependency, its manifest module and `layout.menuWidth`.
    - 5.5c-1 toolbar focus: Up from the first row lands on the active toolbar button; Down returns to the last card; Search opens focused; the backdrop fills the screen behind a transparent toolbar; focus returns to the last card after Back (`FocusableCard` passes its native tag, Home refocuses it 100 ms after regaining focus; the stack's transitionEnd never fires on Vega); a first-row card scrolls Home to the top; My media cards open Movies / Shows.
  - Decisions for 5.5: avatar press → picker (switch user); Settings stays a full screen; Movies/Shows only reachable from My media; Back on Home exits with no confirmation; toolbar only on Home and Search; the Home backdrop fills the whole screen.
- **Checks on `main`:** lint 0 errors (12 Vega SDL notices), Jest 371 passing, the Release build installs and runs on the Fire TV. The TV is signed in as `melojms` (every `run-app` wipes that).
- **Next: the user wants the movie details screen, then movie playback** (requested 2026-10-10). Start with the approach for the details screen and wait for approval; split into subtasks of ≤3 source files, parallel where file scopes don't overlap.
  - **Task 7 (movies first): movie details.** Replace `DetailsPlaceholder` for movies (episodes/series stay on the placeholder until later). Port androidtv's `ui/itemdetail/FullDetailsFragment.java`, `FullDetailsFragmentHelper.kt`, `MyDetailsOverviewRow.kt` (and the details presenters under `ui/presentation/`): backdrop, logo/title, info row (year, rating, runtime, "ends at", community/critic rating, resolution/audio badges), overview, genres, director/cast, actions (Resume / Play / Restart, Watched, Favorite, audio/subtitle/version pickers later), rows for cast and similar items (`getSimilarItems`). Data via TanStack Query like `src/api/home.ts`.
  - **Task 8: playback MVP for movies.** See docs/PLAN.md "Playback design" steps 1–5 and 9 (device profile from `MediaSource.isTypeSupported`, `getPostedPlaybackInfo` resolver, URL-mode direct play first, reporting start/progress/stopped, resume with pre-roll). androidtv references: `ui/playback/PlaybackManager.kt`, `PlaybackController.java`, `VideoManager.java`, `util/profile/` (device profile), `ui/playback/rewrite/`. Vega references: the `amazon-devices-vega-media-player` skill and `react_native_for_vega_media_player.md` (Amazon Devices MCP). Shaka/HLS transcoding is task 9.
  - **Skipped for now:** task 6 (library grids) still shows mock data in Movies/Shows; that's fine because details/playback are reachable from Home's rows.
- **Follow-ups:**
  - The Movies grid needs top padding while scrolling: the previous row's year labels show at the top.
  - Add tests for repeated `onEndReached` calls, the end of paging, and progress values ≤0 or ≥1.
  - Two saved servers with the same name make the "Only <user> on <server>" label ambiguous.
  - The user picker doesn't reload when you come back to it; a pending `restoreSession` still signs in after you leave.
  - Discovery can't tell a TLS failure from "offline"; both show the unreachable message.
  - Jest warns "a worker process has failed to exit gracefully" (a leaked timer somewhere); find it with `--detectOpenHandles`.
  - Movies and Shows open with nothing focused; focus their first item (5.5c-1 left it out of scope).
  - The 100 ms refocus delay on Home is tuned on this TV only; the refocus tag points at a recycled Carousel view, so a refetch that reorders a row may focus a different card.
  - Lock files: only regenerate `package-lock.json` when a rebase conflicts on it. Regenerating from an existing `node_modules` strips `resolved`/`integrity`.
  - KEY_HOME sent with `inputd-cli` from inside Caravela did nothing (Back worked). Check with the real remote.
  - The app-pill SVG → PNG generator isn't in the repo; re-export `caravela-pill.svg` to 512×512 by hand.
  - Home: tests for a 401 on sections, Recently added erroring when My media isn't in the order, a row emptying while it holds preferred focus, and the backdrop timer on unmount.
  - Continue watching uses wide cards for movies too (androidtv mixes poster and wide); our Carousel row has one card shape.
  - From 3d: tests for a countdown whose `expiresAt` is already past (show 0:00), repeated Try again failures, Sign in pressed while the Quick Connect check is pending, and a button that turns disabled while focused and active.

## Decisions and preferences
- **App:** name **Caravela**, package `com.melojms.caravela`, icon concept B "Sail" (`assets/brand/caravela-icon.svg`). Licence GPL-2.0. Unofficial; works with Jellyfin.
- **Scope:** movies and TV shows only. No Live TV or music. English only.
  - Deferred: UDP server discovery (the user types the server address) and websocket remote control.
- **Jellyfin:** 12.0+ (the test server runs 12.2; its address is in `docs/LOCAL.md`, which is untracked) with `@jellyfin/sdk` 1.0.0. Storage is Vega's async-storage. Tokens are unencrypted for now, which the user accepted.
- **Privacy (public repo, https://github.com/melojms/caravela):** never commit the server address (keep it in `docs/LOCAL.md`; briefs say "the server address in docs/LOCAL.md"), and never commit a screenshot that shows the server address or an unblurred avatar. Keep those in the scratchpad. Blurred avatars are OK. Before pushing, `git grep` for the hostname from `docs/LOCAL.md` must find nothing.
- **Login:** test user `melojms`. **Never ask for or use the password**; use Quick Connect and the user approves it.
- **Look and feel: match the official jellyfin-androidtv app.** When in doubt, check how it's done there. A shallow clone lives at `../caravela-wt/ref/jellyfin-androidtv` (Home: `app/src/main/java/org/jellyfin/androidtv/ui/home/`, cards: `ui/presentation/CardPresenter.kt`, `ui/composable/item/`, backdrop: `data/service/BackgroundService.kt`, `ui/background/AppBackground.kt`).
- **UI:** the side menu changes section on press, not on focus. It will be replaced by a top toolbar in task 5.5.
- **Data:** TanStack Query for server data. Home rows load 20 items each. A 401 mid-session sends the user to the picker with the "expired" notice. My Media shows only Movies and TV libraries. Next Up stays separate from Continue Watching.
- **User rules** (see also `~/.claude/CLAUDE.md`):
  - Describe the approach and wait for approval before coding.
  - Split work that touches more than 3 files into smaller tasks.
  - List edge cases and suggested tests after coding.
  - For bugs, write a reproducing test first.
  - Use `git switch -c`.
  - Commits have no Co-Authored-By or Claude-Session trailers.
  - Don't push or open PRs unless asked. `origin` is the public GitHub repo; push `main` only.
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
  - If `package-lock.json` conflicts, regenerate it with a clean `rm -rf node_modules package-lock.json && npm install`; otherwise keep it and run `npm ci`.
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
- **Vega Virtual Device (simulator):** `vega virtual-device start` works, and `run-app … -d VirtualDevice` installs the x86_64 build (vda serial `emulator-5554`). But agents can't check their work there: `gwsi-tool-screenshooter`, QEMU `screendump` and the emulator console screenshot all give black images, and keys sent with `inputd-cli` don't reach apps. Appium with the Vega driver is the only documented route (Node ≤22, flaky screenshots per the forum). Use the Fire TV; if it's busy, finish code/tests/builds and batch the TV checks.
- **Main checkout:** run `npm ci` before building there; its `node_modules` goes stale as worktrees add packages.
- **Playback** (task 8+): the research notes are in docs/PLAN.md under "Playback design". Use Shaka 4.16.13-r1.2 for HLS. ASS and PGS subtitles must be burned in by the server.
