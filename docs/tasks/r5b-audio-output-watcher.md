# Task R5b: watch the audio output and report when Dolby support changes

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r5b (branch `task/r5b-audio-output-watcher`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R5, Phase 2). **R5a runs in parallel** in `/home/melojms/projects/melojms-git/caravela-wt/task-r5a` and owns `src/playback/deviceProfile.ts` and its tests: don't edit those. R5a adds `supportsDolby(): boolean` there (true when AC-3 or E-AC-3 is supported by the current output); this module takes such a function as a parameter, so it doesn't import it. R5c (later) wires both into `PlayerScreen` and does the full Fire TV check.

## Why
Amazon requires the app to detect a change of audio output capability during playback (e.g. HDMI with Dolby ↔ a Bluetooth headset without) and switch the codec (Vega docs, media-player requirements, "Codec Selection"). The user chose to switch in **both** directions (Dolby lost and Dolby gained).

The R5-0 probe (branch `probe/r5`, Fire TV, 2026-10-17; its code: `git -C /home/melojms/projects/melojms-git/caravela-wt/probe-r5 show HEAD`, see `src/dev/audioOutputProbe.ts`) showed:
- **`AudioManager.registerAudioEventObserverAsync(callback)`** from **`@amazon-devices/keplerscript-audio-lib`** (`~2.0.18-rn-83`) calls back with `{audioEvent: 0 /* DEVICE_STATE_UPDATE */, device, role, connect}` when a Bluetooth headset connects (`device: 8` A2DP, `role: 1`, `connect: true`) or disconnects (`connect: false`). `unregisterAudioEventObserverAsync()` removes it. Only **one observer is allowed system-wide** for the app, so it must be unregistered when the player goes away.
- The output's new formats show up **0.5–1.6 s after** the event (KMD / `isTypeSupported` answers change then), so read the capability a little later, and again once more.
- `getSupportedPlaybackConfigurationsAsync` once rejected with `null` mid-switch; this module doesn't need it (the `readDolby` function covers the answer), but any call into the library must be caught.
- The `kepler-graphics` display listener and the media element sent nothing useful: **don't add `kepler-graphics`** (it pulls ~540 old packages into the lockfile).
- The audio library's lint rule asks for `[[needs.privilege]] com.amazon.audio.privilege.settings.control`; Amazon's docs say only its setters need it (system apps only). The user wants only what's essential to publish: **don't declare it** unless the observer actually fails without it on the TV (then stop and report, don't add it yourself). If the lint rule errors without it, report the exact message.
- Vega's native modules throw at import under Jest; the probe loaded them with a lazy `require`. A Jest mock in `test/__mocks__/` mapped in `jest.config.json` (like w3cmedia's) is the cleaner way, if it works.

## Approach (approved)
1. **Dependency**: add `@amazon-devices/keplerscript-audio-lib` `~2.0.18-rn-83` to `package.json` (`npm install`, so the lockfile only gains that package). It's a Vega system library (check its `kepler-compatibility.json` / that the Release bundle leaves it out, the way R6 checked `kepler-media-controls`) → add it to `NOT_BUNDLED` in `test/about/licenses.spec.ts`. Keep the `[[needs.module]] id = "/com.amazon.kepler.audio_lib_2@IAudioLib_0"` entry the build adds to `manifest.toml` (and nothing else there unless the docs require it: check `search_documentation` with `target_platform {"device_os": ["vega_os"]}` for keplerscript-audio-lib setup, `[wants]` / services).
2. **`src/playback/audioOutput.ts`** (new):
   ```ts
   export type AudioOutputOptions = {
     /** Reads whether Dolby (AC-3 / E-AC-3) is supported right now. */
     readDolby: () => boolean;
     /** Delays after an output event before reading again (default [1000, 2500] ms). */
     settleMs?: number[];
   };
   /** Calls onChange(dolby) when the output's Dolby support differs from the last value seen. Returns a stop function. */
   export function watchAudioOutput(onChange: (dolby: boolean) => void, options: AudioOutputOptions): () => void;
   ```
   - On start: read the baseline with `readDolby()`, register the observer.
   - On each `DEVICE_STATE_UPDATE` (ignore other events and non-sink roles if the role tells them apart; log the event once with `console.log` so a Release build shows it): schedule reads at each `settleMs` delay (a new event restarts the schedule); on a read that differs from the last value, update it and call `onChange` once. A `readDolby` that throws counts as "no change".
   - Stop: clear timers, unregister the observer (catch and ignore failures), no callbacks after stop. Starting a second watcher while one runs: stop the first (one observer per app), and say what you chose.
   - Registration failure (rejected promise or an error status): log once, behave as a watcher that never fires; playback must not be affected.
3. **Tests first**, see them fail, `test/playback/audioOutput.spec.ts` with a mock of the audio library (fake timers): event → no change → no callback; event → change at the 1 s read; change only visible at the 2.5 s read; two events in a row restart the schedule and give one callback; change back and forth (gained then lost); non-device events ignored; `readDolby` throws; stop unregisters and suppresses late timers; register rejects; unregister rejects; a second watcher replaces the first.

## Scope (only this)
`src/playback/audioOutput.ts`, `package.json`, `package-lock.json`, `manifest.toml` (only the build's `needs.module`), plus `test/playback/audioOutput.spec.ts`, a mock under `test/__mocks__/`, `jest.config.json` (the mock mapping) and `test/about/licenses.spec.ts` (`NOT_BUNDLED`).

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors), full `npm test` (known flaky specs: Follow-ups in `docs/HANDOFF.md`; rerun them alone), `npm run build:release`, `npm run licenses` after the build leaves `src/about/licenses.json` unchanged (if it changes, the library is bundled after all: report it).
- `vega exec vpt validate manifest.toml` 0 errors.
- No full device check (R5c does that). One short Fire TV check that the observer registers **without the privilege**: a temporary, uncommitted call to `watchAudioOutput` (e.g. from `PlayerScreen` behind nothing, logging `onChange`) in a Release build, start any title, and look for the registration status in the device log. Hold `flock /tmp/caravela-device.lock -c '…'` for install/launch/input; start `loggingctl log -f` outside the lock (see "How we work" in `docs/HANDOFF.md`). The user has a Bluetooth headset but isn't needed here: only the registration result matters. Then reinstall a clean build from your committed branch and revert the temporary change.

## Rules
- Only the files in Scope (plus this brief). One commit ("Watch the audio output for Dolby support changes"), no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build/licences/vpt results, whether the observer registered on the TV without the privilege (status value), the exact lint message if any, edge cases you thought about and suggested further tests, anything odd.
