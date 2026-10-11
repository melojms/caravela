# Task 6d: library grids on the Fire TV

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-06d (branch `task/06d-device-check`, from `main`).
Background: read docs/HANDOFF.md first, especially "How we work", "Signing in during a check", "Shared Fire TV", "Screenshot (Fire TV)" and "Remote input", plus the Task 6 entry under Status. Then read docs/tasks/06*.md (what was built). Platform: Vega OS, React Native 0.83, Vega SDK 0.24, Jellyfin 12.2.
The user has **already approved** this check on the Fire TV. Don't ask again for approval of the overall approach.

**What's on `main`:** My media → Movies/TV opens `src/screens/LibraryScreen.tsx` (header with sort / unwatched / favorites / letter buttons, `PosterGrid` with row-aligned scrolling and `scrollEnabled={false}`, `LetterPicker`, the Sort by panel via `TrackPicker`). Sort and filters are saved on the server (client `jellyfin-androidtv`). It all passed on the simulator; it has never run on the Fire TV.

## Setup
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, then `npm run build:release`. Use `build/armv7-release/caravela_armv7.vpkg` on the **Fire TV** (`192.168.50.124:5555`). Simulator not needed.
- Read `vega_cli_commands_reference.md` (Amazon Devices MCP, `target_platform: {"device_os": ["vega_os"]}`) before using any Vega CLI command not already in HANDOFF.md.
- Every install / launch / input / screenshot flow runs inside `flock /tmp/caravela-device.lock -c '…'`; hold the lock for a whole flow. Log capture starts outside the lock, detached, stopped by pid.
- `run-app` wipes storage: add the server (address in docs/LOCAL.md in the main checkout) and sign in as **`demo` with an empty password**. After that, reinstall with `vega device install-app` (keeps the sign-in). Never use `melojms`'s password.
- Screenshots stay in your scratchpad (never in the repo), downscaled before viewing. Don't print tokens.

## Checks (screenshot each)
1. Home → My media → Movies: header (title, focused name, status line, `1 | 76`), first card focused, no half rows at the top, nothing clipped on the left.
2. Hold/press Down quickly through the whole library (past item 60 so page 2 loads) and back up: scrolling stays row-aligned (no half rows, no jumps, the focused card never off-screen). Note how long page 2 takes to appear and whether scrolling feels smooth (a short screen recording isn't needed; describe it).
3. Up to the buttons: Sort by → Date added (order + status text change, Letter button hidden), Back from the panel returns focus to Sort, then back to Name.
4. Unwatched on, Favorites on (empty state, focus stays on Favorites), both off.
5. Letter → B; Letter → Back (focus returns to Letter); Letter → B again (cleared); `#` then clear it (first card focused, `1 | 76`).
6. Right on the last column of a full row and of the short last row: focus stays put.
7. A movie → Details → Back: the same card focused at the same scroll position.
8. Back → Home → My media → Shows: series grid; a series opens the placeholder; Back returns to the grid.
9. Relaunch without reinstalling (`terminate-app` + `launch-app`), reopen Movies with a non-default sort set before: it's restored. **Reset Movies and Shows to Name with no filters at the end.**

## Fixes
- If something fails, find the cause (logs, screenshots). Fix it if it's in `src/screens/LibraryScreen.tsx`, `src/components/PosterGrid.tsx`, `src/components/LibraryHeader.tsx` or `src/components/LetterPicker.tsx`: a failing test first, then the fix, then check again on the TV.
- If paging is clearly slow (several seconds per page), try the lighter fields set in `src/api/library.ts` (`LIBRARY_FIELDS`, keeping what `toCardItem` needs), measure before/after, and report.
- Anything bigger: stop and report.

## Rules
- Commit only real fixes (no logs, no debug code), with no Co-Authored-By or Claude-Session trailers. Run `npm run lint`, `npx tsc --noEmit` and `npm test` before each commit. Nothing from `src/vendor/`.
- Don't push, don't open a PR, don't merge.

## Done = report back
For each check: what happened, with scratchpad screenshot paths; page-load timing; any fixes with the test count and lint result; anything unresolved.
