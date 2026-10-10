# Task 3a-3: user picker

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03a3 (branch `task/03a3-user-picker`, from `main`).
Background: read docs/HANDOFF.md, docs/PLAN.md and docs/tasks/03a1-session-gate.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Another agent is building the add-server screen (3a-2) at the same time** in `../caravela-wt/task-03a2`. Stay inside the file scope below so the two branches merge cleanly.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/auth/authService.ts`**: add two methods to `AuthService`.
   - `getPublicUsers(serverId): Promise<PublicUser[]>`
     - Uses `getUserApi(api).getPublicUsers()` without a token.
     - `PublicUser` is `{id, name, primaryImageTag?, hasPassword}`. Skip entries that have no `Id` or `Name`.
     - Throws `AuthError('unknown-server')` for an unknown server. Network errors propagate.
   - `getUserImageUrl(server, userId, {tag?, accessToken?, maxHeight})`, or a standalone exported function if that fits better.
     - Builds `${address}/Users/${userId}/Images/Primary?maxHeight=…&quality=90`, plus `&tag=…` when there's a tag and `&api_key=…` when there's a token.
     - The user decided that a saved token may be put in the image URL. Users without a saved token are requested without one.
   - Add tests to `test/auth/authService.spec.ts`, with the API mocked the same way the existing tests do it. Also update `test/auth/fakes.ts` (`fakeService`) with the new method.
2. **`src/screens/auth/UserPickerScreen.tsx`** replaces the placeholder for the `UserPicker` route (`{serverId}` param).
   - **Header:** the server name and its address, in muted text.
   - **Notice:** if `useSession().notice` is set, show its message in a banner.
     - When the notice is `offline`, the banner has a **Retry** button (`retry()`), and that button gets the initial focus.
     - The notice is cleared by the gate as soon as the user leaves this screen, which 3a-1 already does.
   - **Users:** a horizontal row of user tiles that merges the saved users (`store.getServer(serverId).users`) with the public users, de-duplicated by id.
     - Saved users come first, sorted by `lastUsed` descending; public-only users follow, sorted by name.
     - If `getPublicUsers` fails, show the saved users anyway, with a small note: "Couldn't load the server's users."
     - While loading, show an ActivityIndicator.
   - **Tile:**
     - A round avatar from `getUserImageUrl`, using the saved token when there is one.
     - When there's no tag and no saved token, or the image fails (`onError`), show the user's initials on a theme-coloured circle instead.
     - The name goes under the avatar, on one line with `numberOfLines={1}` and an ellipsis; check this with a long name.
     - Use a focus style consistent with `FocusableCard`/`FocusableButton`, and look at those components first. The first tile gets `hasTVPreferredFocus` unless the offline Retry button is shown.
   - **Pressing a tile:**
     - The user has a saved token: call `restoreSession(serverId, userId)`.
       - It returns a session: `signIn(session)`.
       - It returns `undefined` (expired): navigate to `QuickConnect {serverId, userId}`.
       - It throws: show "Can't reach <server name>." inline.
       - Show a busy state on the tile while this runs, and ignore extra presses.
     - The user has no token: navigate to `QuickConnect {serverId, userId}`. The user decided Quick Connect is the default; the Password screen is reached from inside Quick Connect in 3b-1.
   - **Actions** after the tiles:
     - "Add user" (for hidden users): navigate to `Password {serverId}`, where 3b-1 adds a username field.
     - "Change server": `navigation.navigate('AddServer')`.
   - Inject the dependencies (`authService`, `authStore`) as optional props, defaulting to `getAuthService()`/`getAuthStore()`, for tests.
3. **`src/navigation/RootNavigator.tsx`**: change **only** the `UserPicker` `Stack.Screen` to use `UserPickerScreen`. Leave the rest of the file alone; the other agent edits the AddServer element.

## Tests
- `test/auth/UserPickerScreen.spec.tsx`, with the service, store, session and navigation mocked:
  - Saved and public users merge without duplicates, in the right order.
  - Public users failing still shows the saved users and the note.
  - A saved token signs in; an expired token goes to QuickConnect; a network error shows the inline message.
  - A user without a token goes to QuickConnect.
  - Add user goes to Password; Change server goes to AddServer.
  - Each notice kind shows; the offline notice has Retry, which calls `retry`.
  - A failed avatar falls back to the initials.
  - A long name is truncated (`numberOfLines`).
  - Extra presses while busy are ignored.
- `test/auth/RootNavigator.spec.tsx`: the existing tests use the UserPicker placeholder (`auth-UserPicker`, `auth-notice`, `auth-placeholder-button` on the picker). Update them to the real screen's test IDs while keeping what they check:
  - The expired notice shows.
  - Offline Retry signs in.
  - Navigating away clears the notice.
  - The picker opens AddServer, and Back pops back to the picker.
  - Back on the first auth screen exits.
- Keep all existing tests passing.

## Checks
- `npm run lint` (0 errors), `tsc --noEmit`, `npm test`, then `npm run build:release`.
- On the TV, inside `flock /tmp/caravela-device.lock -c '…'` (see HANDOFF.md). AddServer isn't built in this branch, so check the picker on the device this way:
  - Seed a server temporarily: add a dev-only `upsertServer` for `https://jellyfin.example.lan`, or add the server some other way, then build and launch.
  - It should show `melojms` and the other public users with avatars.
  - Take a screenshot to `docs/screenshots/03a3-user-picker.png`, downscaled to 960 px wide.
  - **Remove the seeding before committing.**
  - **Do not log in**, never ask for or type a password, and don't select a user. Selecting one would start Quick Connect, which still has a placeholder screen.

## Rules
- Source files: `authService.ts`, `UserPickerScreen.tsx`, and the one line in `RootNavigator.tsx`. Add tests and `fakes.ts` as needed. Don't touch `store.ts`, `serverDiscovery.ts` or `SessionContext.tsx`.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot path
- edge cases and suggested tests
- anything unresolved
