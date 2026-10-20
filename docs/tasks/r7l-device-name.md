# Task R7-l: send the device name "Fire TV" instead of "Fire TV (Vega)"

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r7l (branch `task/r7l-device-name`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md`, step 2 of the "Road to submission" in `docs/HANDOFF.md`. No other agent runs in parallel.

## Why
The app sends the device name `Fire TV (Vega)` to the Jellyfin server (`DEVICE_NAME` in `src/api/client.ts`), and the privacy policy quotes it. The Appstore rule is "don't mention Vega in any field". The privacy policy isn't strictly a listing field, but a reviewer may follow its link. The user chose to send the plain name **`Fire TV`** for v1.0.

Not part of this task: sending the device's real name. Vega's `getFriendlyDeviceName()` (`@amazon-devices/kepler-identifiers`) needs a runtime privilege and a consent dialog for a name the user set, so it goes to 1.1 as a follow-up. The device ID stays the same, so the user's existing sign-ins and tokens keep working, and servers just show the new name.

## Approach (approved)
1. **Tests first**: in `test/api/client.spec.ts`, assert that `DEVICE_NAME` is exactly `'Fire TV'` and has no "Vega" in it. Run the test and see it fail.
2. **`src/api/client.ts`**: change `DEVICE_NAME` to `'Fire TV'`. Nothing else.
3. **`site/privacy/index.html`**:
   - In the paragraph that quotes the device name, change `"Fire TV (Vega)"` to `"Fire TV"`.
   - Set "Last updated" to `20 October 2026`.
   - Don't change any other wording.
4. **`test/playback/resolver.spec.ts`**: its fixture has `name: 'Fire TV (Vega)'`. Change it to `'Fire TV'` so `git grep "Vega)"` finds nothing left.
5. Check that `git grep -n "Fire TV (Vega)"` matches only the docs (`docs/HANDOFF.md` and `docs/STORE-LISTING.md` describe the old name; the orchestrator updates those after the merge, so leave them).

## Scope (only this)
`src/api/client.ts` and `site/privacy/index.html`, plus the two spec files above.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors) and `npx tsc --noEmit` (no new errors).
- Full `npm test`. The known flaky specs are under Follow-ups in `docs/HANDOFF.md`; rerun them alone if they fail.
- `npm run build:release`.
- **Fire TV check.** The commands are under "How we work" in `docs/HANDOFF.md`. Run every device step inside `flock /tmp/caravela-device.lock -c '…'`.
  - Install over the current build with `vega device install-app`. That upgrades in place and keeps the sign-in. The TV is signed in as `demo` on the test server; its address is in `docs/LOCAL.md`.
  - Launch the app and open Home. Then play any item for a few seconds and leave the player.
  - Look up the session's device name through the API as `demo`. Use `GET /Sessions` with the token Caravela already has, or sign in fresh with `demo` and an empty password through `curl`. If the laptop can't reach the server, run `curl` on the TV (see "How we work"). Report what `DeviceName` shows: `Fire TV` from the existing token, or still the old name.
  - If an existing token keeps the old name, sign out and sign in again as `demo` (empty password) on the TV, and report what shows then. Jellyfin may store the name per device when signing in. Don't change any server settings, and don't use `melojms`.
  - Take a screenshot of Home and look at it. Keep it in your scratchpad, never in the repo.
  - Leave the TV signed in as `demo` on the test server, running this build.

## Rules
- Only touch the files in Scope, plus this brief.
- Make one commit, with no Co-Authored-By or Claude-Session trailers.
- Don't push and don't merge.
- Never write the server address or a token into a committed file.

## Done = report back
- The files you changed.
- The tests you added, and the Jest count.
- The results of lint, tsc, the tests and the build.
- What the server showed as `DeviceName`, before and after signing in again.
- Edge cases you thought about, suggested further tests, and anything odd.
