# Task 5.5c-1: toolbar focus, full-screen backdrop, My media → libraries

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-055c1 (branch `task/055c1-focus`, from `main`).
Background: read docs/HANDOFF.md (section "Next: task 5.5"), docs/tasks/055a-toolbar.md and docs/tasks/055b-stack-nav.md (both merged). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Look and feel: match jellyfin-androidtv** (clone at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv`). Under `app/src/main/java/org/jellyfin/androidtv/ui/`: `home/HomeFragment.kt` (focus exits the rows Up **only from the first row**; the toolbar's centre group has the focus requester), `shared/toolbar/MainToolbar.kt`, `shared/toolbar/Toolbar.kt`, `background/AppBackground.kt` (the backdrop sits behind everything, toolbar included). For focus on Vega, use the Amazon Devices MCP docs (`search_documentation`, `target_platform` `["vega_os"]`; e.g. TVFocusGuideView `destinations`/`autoFocus`, `hasTVPreferredFocus`, FocusManager) and the `amazon-devices-vega-focus-management` skill.

**Another agent runs at the same time:** 5.5c-2 (cleanup) in `../caravela-wt/task-055c2` edits `package.json`, `package-lock.json`, `manifest.toml`, `src/theme/tokens.ts` and `test/Toolbar.spec.tsx` (prettier only). **Don't touch those.**

## Problems seen on the TV after 5.5b
1. Up from the first row (My media) reaches the toolbar but lands on the **avatar**. It should land on the **active button (Home)**, like androidtv's centre-group focus requester.
2. Down from the toolbar should return to the rows (the last focused card if possible, else the first row).
3. Search opens with **nothing visibly focused**. The active toolbar button (Search) should get focus when the screen has no other focusable content.
4. The Home **backdrop stops below the toolbar**. It must fill the whole screen behind the toolbar; the toolbar background must be transparent over it (keep text readable: the Backdrop already dims).
5. After Back from Search, **focus lands on the toolbar** and the rows stay scrolled. Coming back to Home should restore focus to the last focused card (this also closes the HANDOFF follow-up "Home doesn't remember the last-focused card"); if that card is gone after a refetch, the first card of the first row.
6. Movies and Shows have **no entry point**. Pressing a My media card opens `Movies` for a `movies` library and `Shows` for a `tvshows` library (by `CollectionType`). No route params yet (task 6 adds the library ID). Other cards still open `DetailsPlaceholder`.

## Scope (only this)
- `src/screens/HomeScreen.tsx`, `src/screens/ScreenContainer.tsx`, `src/components/Toolbar.tsx`. Prefer the smallest change that works on the TV; explain the focus mechanism you chose.
- Up from rows other than the first stays within the rows (the native D-pad behaviour should already do that; confirm).

## Tests
- Home: My media card for movies / tvshows navigates to Movies / Shows; other cards → DetailsPlaceholder; Backdrop is rendered behind the toolbar (full-screen container); restoring the last focused card on return (as far as the focus mechanism can be tested in Jest).
- ScreenContainer / Toolbar: the active button is the preferred focus target when the toolbar gets focus; Search's initial focus.
- Keep all other tests green. Add tests the 5.5b agent suggested: toolbar Home from a deeper screen lands on a single Home; Back from Movies / Shows / Details.

## Checks
- `npm ci` first. `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **On the TV** (hold `flock /tmp/caravela-device.lock -c '…'` for the whole flow, including while waiting). The 5.5c-2 agent will also install once; take a screenshot first and wait if it's mid-check.
  - `run-app` wipes storage: add `jellyfin.example.lan` (type with `inputd-cli send_text`), pick `melojms`, Quick Connect, **print the code and ask the user to approve it**, wait. **Never use a password.** The first launch after install may be black for a few seconds; wait or `vega device launch-app`.
  - Verify each of problems 1–6 on the device, plus: Up from Continue watching goes to My media (not the toolbar); Back from Movies and Shows returns to Home with the card focused; Back on Home still exits.
  - Screenshots (960 px wide; **blur or crop the avatar** before committing): `docs/screenshots/055c1-home-toolbar-focus.png` (Home button focused, backdrop behind the toolbar), `docs/screenshots/055c1-movies.png` (Movies opened from My media).
  - **Don't sign out at the end.**

## Rules
- Commit with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the files changed and the focus mechanism, each problem 1–6 verified on the TV (yes/no)
- the test count, lint/build/install result, screenshot paths
- edge cases and suggested tests, anything unresolved
