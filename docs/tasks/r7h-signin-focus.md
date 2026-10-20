# Task R7-h: Down from the password field lands on Sign in

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r7h (branch `task/r7h-signin-focus`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (Phase 3, R7-h). This is the last code task before v1.0. No other agent is running.
This task includes a Fire TV check (below).

## Why
The Phase 3 certification run (`docs/tasks/p3-certification-run.md`) found that the sign-in is a reviewer's first stumble. Amazon's reviewers sign in as the public demo server's `demo` user, who has no password:
- they pick `demo` on the user picker → **Quick Connect** opens (the default since task 3b, as in jellyfin-androidtv) → "Use password" → the Password screen with the password field focused;
- they leave the field empty and press **Down**: focus lands on **"Use Quick Connect"**, not **"Sign in"**. Sign in is the left button of the actions row (`Sign in`, gap, `Use Quick Connect`), and Vega's focus search picks the other one. Pressing it loops them back to Quick Connect.

The same happens on Add user (no `username` param: a username field above the password field).

Decided by the user, so don't change it: **Quick Connect stays the first screen** for every user. The server can't tell us who has no password: Jellyfin 12.2's `/Users/Public` reports `HasPassword: true` for `demo` too, and trying an empty password on pick would count as a failed login toward the lockout for real users. androidtv also opens Quick Connect first. The reviewer notes (`docs/STORE-LISTING.md`, not your file) will spell out the path through "Use password".

## Approach (approved)
1. **`src/components/FocusableButton.tsx`**: forward a ref to its `Pressable` (`memo(forwardRef(...))`, keep the display name/lint happy), so a screen can point focus at it. No behaviour change for existing callers.
2. **`src/screens/auth/PasswordScreen.tsx`**: make Down from the password field go to Sign in, with `FocusManager.setNextFocus(passwordInputRef, signInRef, 'down')` (`import {FocusManager} from '@amazon-devices/react-native-kepler'`; typings in `node_modules/@amazon-devices/react-native-kepler/Libraries/FocusManager/FocusManager.d.ts`; it accepts a component or a native tag). `src/components/PosterGrid.tsx` (task 6d) does the same for Up in the grid. Call it when the password field gets focus (both views are mounted then, and it's re-applied if the actions row changes because Quick Connect turned out to be on). If `setNextFocus` on a `TextInput` doesn't work on the device, find out why and try the alternatives (`nextFocusDown` on the field, or a `TVFocusGuideView` around the actions row with `destinations={[signIn]}`); report what worked and what didn't.
   - On Add user, check that Down from the username field still reaches the password field (it should already); if it doesn't, fix it the same way.
   - Leave everything else alone: Right from Sign in still reaches "Use Quick Connect", Up from the buttons still reaches the password field, the field still has `hasTVPreferredFocus` when there's a username.
3. **Tests first**, see them fail, in `test/auth/PasswordScreen.spec.tsx` (and a small `FocusableButton` spec for the ref, if one exists under `test/components/`): with the `FocusManager` mock (find how `PosterGrid`'s tests mock it), focusing the password field calls `setNextFocus` with the field and the Sign in button and `'down'`, both with "Use Quick Connect" showing and without it (Quick Connect off), and on Add user (no `username`). A ref passed to `FocusableButton` reaches the `Pressable`.

## Scope (only this)
`src/screens/auth/PasswordScreen.tsx`, `src/components/FocusableButton.tsx`, their tests and mocks.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors), full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- **Fire TV** (commands under "How we work" in `docs/HANDOFF.md`; every install, key and screenshot inside `flock /tmp/caravela-device.lock -c '…'`, holding the lock for a whole flow; never a long-running process inside the lock):
  1. **The reviewer's path, from a fresh install** (`vega run-app` with the armv7 Release VPKG wipes storage): add the server `https://demo.jellyfin.org/stable` (typing: see "Typing" in How we work), pick `demo` → Quick Connect → "Use password" → screenshot (password field focused) → **Down** → screenshot: Sign in focused → Enter → Home. If the demo server is down (503), use the test server's hidden `demo` user via Add user instead and say so.
  2. **Add user** on the test server (the server address in docs/LOCAL.md): Add user → type `demo` in the username field → Back to close the keyboard → Down (password field) → Down → screenshot: Sign in focused → Enter → Home.
  3. Right from Sign in reaches "Use Quick Connect" when it shows; Up from Sign in returns to the password field.
  Look at each screenshot yourself (downscale it first; the TV captures at 4K). Keep screenshots in your scratchpad, never in the repo (they can show the server address). Leave the TV signed in as `demo` on the test server with this build, as the handoff expects.
- After a cold start, wait ~12 s before the first key, and screenshot before any Enter (the first keys are sometimes lost).

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
- Never put the server address in a committed file.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, what the Fire TV showed for each check (and which focus mechanism worked), edge cases you thought about and suggested further tests, anything odd.
