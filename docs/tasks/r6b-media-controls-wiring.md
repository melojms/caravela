# Task R6b: declare Vega Media Controls and give the player the component

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r6b (branch `task/r6b-media-controls-wiring`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R6). Another agent runs **R6a** at the same time in `../caravela-wt/task-r6a`; it touches `src/playback/PlayerController.ts`, `src/playback/mediaControls.ts` (new), `test/playback/*` and `test/__mocks__/react-native-w3cmedia.ts`. Don't edit those. R6a makes `PlayerController` take the Vega Media Controls focus (and route Alexa / the remote's media keys through itself) when `PlayerOptions.componentInstance` is set; that option is already on `main` (commit "Add the Media Controls component option to PlayerController"), so you can pass it now. **No Fire TV check in this task**: the orchestrating session checks R6a + R6b together after merging.

## Why
Alexa "pause" / "play" did nothing during playback. Voice commands reach an app only when its manifest declares Vega Media Controls (KMC). The probe (branch `probe/r6`, worktree `../caravela-wt/probe-r6`; read `git diff main...probe/r6 -- manifest.toml src/screens/PlayerScreen.tsx`) showed on the Fire TV that with these entries every Alexa command and remote media key arrives through Media Controls. Once the manifest declares KMC, w3cmedia's legacy player session (which R1-b left in charge of the remote's ⏯ ⏩ ⏪) turns itself off (`MediaPlayer.isPlayerSessionEnabled = false` in w3cmedia's `dist/MediaPlayer.js`), and those keys arrive as Media Controls commands instead (`handleTogglePlayPause`, `handleFastForward`, `handleRewind`), which R6a handles. So the keys are still handled in exactly one place, and `usePlayerOverlay` must keep not acting on them.

## Approach (approved)
1. **`manifest.toml`** (same as the probe, which `vpt validate` accepted):
   - Main component `categories = ["com.amazon.category.main", "com.amazon.category.kepler.media"]`.
   - An `[[extras]]` block with `key = "interface.provider"`, `component-id = "com.melojms.caravela.main"`, `[extras.value.application]`, `[[extras.value.application.interface]]` with `interface_name = "com.amazon.kepler.media.IMediaPlaybackServer"`, `command_options = ["StartOver", "SkipForward", "SkipBackward"]`, `features = ["AdvancedSeek", "VariableSpeed"]`, with a short comment. Keep `kepler_media_controls_1` in `needs` and `com.amazon.media.playersession.service` in `wants`.
   - Amazon's reference: "Get started with Vega Media Controls" (Vega 0.24, `https://developer.amazon.com/docs/vega/0.24/media-controls-get-started.html`).
2. **`package.json`**: add `@amazon-devices/kepler-media-controls` (`~1.0.25`, the version already installed transitively) and `@amazon-devices/kepler-media-types` (check the installed version) to `dependencies`, as Amazon's W3C Media integration doc asks; update `package-lock.json` with `npm install` (no other dependency changes).
3. **`src/screens/PlayerScreen.tsx`**: get the component with `useKeplerAppStateManager().getComponentInstance()` from `@amazon-devices/react-native-kepler` (`useComponentInstance` is deprecated) and pass it as `componentInstance` in the options where `new PlayerController(...)` gets `{playbackRate: speedSelection}`. Don't add it to the effect's dependencies in a way that recreates the controller (it's stable for the app's lifetime; check).
4. **`src/screens/usePlayerOverlay.ts`**: behaviour unchanged (media keys only bring the overlay up). Update the comments on `SKIP_KEYS` and the hook's doc: the keys now come through Vega Media Controls to `PlayerController` (Play/Pause toggles, ⏩ +30 s, ⏪ −10 s), not the legacy player session; acting here too would run each press twice.
5. **Tests**: `test/screens/PlayerScreen.spec.tsx` checks the controller gets the component instance (mock `useKeplerAppStateManager` if the preset doesn't); `usePlayerOverlay`'s tests (wherever they live) still show media keys don't call pause/seek.

## Scope (only this)
`manifest.toml`, `package.json`, `package-lock.json`, `src/screens/PlayerScreen.tsx`, `src/screens/usePlayerOverlay.ts`, `test/screens/PlayerScreen.spec.tsx`, and `usePlayerOverlay`'s spec if a comment-only change needs nothing there.

## Checks
- `npm ci` (then `npm install` for the new dependencies), then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `vega exec vpt validate manifest.toml` (0 errors).
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors; `test/playback/trickplay.spec.ts` and `src/navigation/RootNavigator.tsx` have known ones on `main`), full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build/validate results, anything odd.
