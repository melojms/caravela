# Task 3a-2: add-server screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-03a2 (branch `task/03a2-add-server`, from `main`).
Background: read docs/HANDOFF.md, docs/PLAN.md and docs/tasks/03a1-session-gate.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Another agent is building the user picker (3a-3) at the same time** in `../caravela-wt/task-03a3`. Stay inside the file scope below so the two branches merge cleanly.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/api/serverDiscovery.ts`**: add a `'not-jellyfin'` error code with the message "\"<input>\" doesn't look like a Jellyfin server."
   - Use it when at least one candidate answered over HTTP but none answered as Jellyfin. That covers an HTTP error status (`isAxiosError` with a `response`), and a 2xx response without `Id`/`Version` (or one that isn't JSON).
   - `unreachable` stays for the case where every candidate failed at the network level (no response, timeout, DNS, TLS).
   - `unsupported-version` still takes priority over both.
   - Update `test/api/serverDiscovery.spec.ts`, writing the new tests first.
2. **`src/screens/auth/AddServerScreen.tsx`** replaces the placeholder for the `AddServer` route.
   - **Layout:**
     - Title "Connect to a server".
     - A short hint, e.g. "Enter your Jellyfin server address, e.g. jellyfin.example.com or 192.168.1.10:8096".
     - A `TextInput` that opens the Vega TV keyboard: `autoCapitalize="none"`, `autoCorrect={false}`, `keyboardType="url"`, and `returnKeyType="go"` with `onSubmitEditing` submitting.
     - A Connect button.
   - **Focus:** the input has `hasTVPreferredFocus`, and the D-pad moves between the input and Connect. Look at the `amazon-devices-vega-focus-management` skill and the Vega TextInput docs (Amazon Devices MCP, `target_platform` vega_os) for how TextInput and the keyboard behave on Vega.
   - **Connect:**
     - Trim the input; if it's empty, show "Enter a server address."
     - While connecting, disable Connect and show "Connecting…", with an ActivityIndicator.
     - Call `discoverServer(input)`, then `getAuthStore().upsertServer({id: systemInfo.Id, name: systemInfo.ServerName ?? address, address, version: systemInfo.Version})`, then `selectServer(id)` from `useSession()`. The session gate resets the auth stack to UserPicker for that server.
     - Inject the dependencies (`discover`, `store`) as optional props, defaulting to the real ones, for tests.
   - **Errors:** show `ServerDiscoveryError.message` under the input for every code (`invalid-address`, `unreachable`, `unsupported-version`, `not-jellyfin`). Any other error shows "Something went wrong. Try again."
   - **Navigation:** Back must still pop to UserPicker when AddServer was opened from there, and exit the app on first run. The gate already handles this, so don't add a BackHandler.
   - Ignore a result that arrives after the screen unmounts.
3. **`src/navigation/RootNavigator.tsx`**: change **only** the `addServer` screen element to use `AddServerScreen`. Leave the rest of the file alone; the other agent edits the UserPicker line.

## Tests
- `test/auth/AddServerScreen.spec.tsx`, with `discover`, `store` and the session mocked:
  - An empty input shows the validation message.
  - Success calls `upsertServer` with the right fields, then `selectServer(id)`.
  - Each error code shows its message.
  - A non-Discovery error shows the generic message.
  - The button is disabled while connecting.
  - Submitting from the keyboard (`onSubmitEditing`) connects.
  - A result after unmount is ignored.
- `test/auth/RootNavigator.spec.tsx`: the existing tests that use the AddServer placeholder (`auth-AddServer`, and the placeholder button on AddServer) must still pass. Update their test IDs only as needed.
- Keep all existing tests passing.

## Checks
- `npm run lint` (0 errors), `tsc --noEmit`, `npm test`, then `npm run build:release`.
- On the TV, inside `flock /tmp/caravela-device.lock -c '…'` (see HANDOFF.md):
  - Install and launch. The app should open on AddServer.
  - Enter `jellyfin.example.lan` with the on-screen keyboard. Check whether `inputd-cli` can type text; if it can't, describe what you tried.
  - Connect. It should land on the UserPicker placeholder with `{"serverId":…}`.
  - Also try a bad address such as `example.com`, which should show the not-Jellyfin or unreachable message.
  - Save screenshots to `docs/screenshots/03a2-add-server.png` and `03a2-error.png`, downscaled to 960 px wide.
  - **Do not log in** and never ask for a password.
- If you can't type on the device, do the device check with a temporary hard-coded default value, then **remove it before committing**.

## Rules
- Source files: `serverDiscovery.ts`, `AddServerScreen.tsx`, and the one line in `RootNavigator.tsx`. Add tests as needed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count
- the lint/build/install result
- the screenshot paths
- edge cases and suggested tests
- anything unresolved
