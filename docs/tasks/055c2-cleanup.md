# Task 5.5c-2: remove what the side menu left behind

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-055c2 (branch `task/055c2-cleanup`, from `main`).
Background: read docs/HANDOFF.md and docs/tasks/055b-stack-nav.md. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this cleanup. Don't ask again.

**Another agent runs at the same time:** 5.5c-1 in `../caravela-wt/task-055c1` edits `src/screens/HomeScreen.tsx`, `src/screens/ScreenContainer.tsx`, `src/components/Toolbar.tsx`. **Don't touch those.**

## Scope (only this)
1. Remove the now-unused `@amazon-devices/react-navigation__bottom-tabs` dependency: `package.json`, and update `package-lock.json` with `npm uninstall` (don't regenerate the whole lock). First `grep -rn bottom-tabs src test` to confirm nothing imports it.
2. Remove its `[[needs.module]]` entry from `manifest.toml` (`/com.amazon.kepler.navigation__bottom_tabs_8@INavigation__BottomTabs_0`). After `npm run build:release`, check the build didn't add it back and that every other `[[needs.module]]` entry is still there.
3. Remove `layout.menuWidth` from `src/theme/tokens.ts` (confirm nothing uses it).
4. Run `npx prettier --write test/Toolbar.spec.tsx` (it fails `prettier --check`). Formatting only.

## Checks
- `npm ci`, then `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **On the TV** (inside `flock /tmp/caravela-device.lock -c '…'` for the whole flow; the 5.5c-1 agent also uses the TV and will be waiting for a Quick Connect approval at some point. **Take a screenshot first; if it shows a Quick Connect code or a signed-in Home that another agent is checking, wait and retry later**): install, check the app starts on Add Server (the first launch may be black for a few seconds; relaunch with `vega device launch-app`). No sign-in. Scratchpad screenshot only.

## Rules
- Files: `package.json`, `package-lock.json`, `manifest.toml`, `src/theme/tokens.ts`, `test/Toolbar.spec.tsx`.
- Commit with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- what was removed, lock diff size, whether the build re-added the manifest entry, test count, lint/build/install result, anything unresolved
