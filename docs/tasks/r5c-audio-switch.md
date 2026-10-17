# Task R5c: reload at the position when the audio output's Dolby support changes

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r5c (branch `task/r5c-audio-switch`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R5, Phase 2), the last R5 subtask. Nothing else runs in parallel. This task includes the **Fire TV check** with the user's Bluetooth headset.

## Why
Amazon's media-player requirements ("Codec Selection"): pick AAC or Dolby from the audio output's capability, and when it changes during playback (HDMI ↔ Bluetooth headset) switch the codec. The user chose to switch in **both** directions (Dolby lost and Dolby gained).

Already on `main`:
- **R5a** (`docs/tasks/r5a-audio-probe-per-play.md`): `src/playback/deviceProfile.ts` probes the audio codecs again on every `buildDeviceProfile()` call (the resolver calls it on each PlaybackInfo request, so every play, Retry and track switch gets the current output's answer), and exports `supportsDolby(): boolean` (AC-3 or E-AC-3 supported right now).
- **R5b** (`docs/tasks/r5b-audio-output-watcher.md`): `src/playback/audioOutput.ts` `watchAudioOutput(onChange, {readDolby, settleMs?}) → stop`. It registers Vega's audio event observer, re-reads `readDolby` 1 s and 2.5 s after each output event and calls `onChange(dolby)` only when the answer changed. One observer per app; stop unregisters. It registered on the Fire TV without any privilege (status 0).

Findings from the R5-0 probe (branch `probe/r5`, Fire TV, 2026-10-17):
- On a headset connect, Vega itself re-routes the audio and re-seeks the pipeline at the same position ~1.8 s later (`waiting` → `seeking` → `seeked` → `playing`), no error. AAC plays on both outputs with no help from the app.
- **The user's TV offers no Dolby over HDMI** (PCM stereo only, even with the Fire TV on "Best available"), so `supportsDolby()` is false on both outputs there and a real Dolby change can't happen on this setup. The user accepted that: the real reload is unit-tested, plus a temporary build on the TV (see Checks).
- Vega drops an app's log lines above 300/s; the player start alone can exceed it. Delay any check-time log you depend on, or look for it more than once.

## Approach (approved)
1. **`src/playback/types.ts`**: `MediaTrack` gets an optional `codec?: string` (the stream's `Codec`, lowercased, e.g. `eac3`, `ac3`, `aac`).
2. **`src/playback/resolver.ts`**: `toMediaTrack` fills `codec` (only when the server sends one). Nothing else changes.
3. **`src/screens/PlayerScreen.tsx`**:
   - For the screen's lifetime (mount → unmount, not per controller, so Retry and switches don't re-register the observer), run `watchAudioOutput(onDolbyChange, {readDolby: supportsDolby})`; stop it in the cleanup.
   - `onDolbyChange(dolby)`: if the **selected audio track's** codec is `ac3` or `eac3`, call the existing `reload(tracks)` with the **current** tracks unchanged (same audio and subtitle indexes), so the resolver re-requests PlaybackInfo with a fresh profile at the current position (stopped first, as a track switch does): Dolby lost → the server now converts to AAC; Dolby gained → it copies the Dolby track again. Otherwise (AAC, other codecs, no codec known) do nothing. Use refs, so the callback always sees the current tracks and phase.
   - Ignore a change while a switch / reload is already resolving (its resolve probes afresh anyway), while the error view shows (Retry probes afresh), and after the screen started leaving (`leftRef` / background). Paused: reload as an audio switch does today, and say what happens to the paused state.
   - One `console.log` per change: the new value and whether it reloaded (a Release build shows it).
4. **Tests first**, see them fail:
   - `test/playback/resolver.spec.ts`: audio tracks carry `codec` lowercased; no `codec` key when the server sends none.
   - `test/screens/PlayerScreen.spec.tsx` (mock `../../src/playback/audioOutput` and capture `onChange`; mock `supportsDolby` if needed): watcher started once on mount and stopped on unmount, not restarted by Retry or a track switch; E-AC-3 track + change (false, then true) → `resolvePlayback` called again with the same audio/subtitle indexes and `mediaSourceId`, starting at the last position, after the old controller's stopped; AC-3 same; AAC track → no new resolve; change during a switch resolve, in the error view, and after `background` → nothing; paused + change → reload, the state you chose.

## Scope (only this)
`src/playback/types.ts`, `src/playback/resolver.ts`, `src/screens/PlayerScreen.tsx`, plus their tests/mocks. On the branch also `README.md` if its Features or Status lists playback details (one line: picks AAC or Dolby from the audio output and switches when it changes).

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (known flaky specs in Follow-ups in `docs/HANDOFF.md`; rerun them alone), `npm run build:release`, `npm run licenses` (no diff), `vega exec vpt validate manifest.toml`.
- **Fire TV** `192.168.50.124:5555`, Release build, test server (address in `docs/LOCAL.md`) as `demo` (empty password; the TV is signed in already, `vega device install-app` keeps it). Read "How we work" in `docs/HANDOFF.md` first: every install, launch, input and screenshot inside `flock /tmp/caravela-device.lock -c '…'`; `loggingctl log -f` started outside the lock and killed by pid; TV logs in UTC. The user is at the TV with the Bluetooth headset: print each step they must do as a line starting with `USER ACTION:` and wait for their reply in your pane; ask them whether they hear sound where it matters.
  1. **Clean build**, The Pitt S1 E1 (E-AC-3 5.1, the server converts it to AAC here): during playback the user connects the headset, then turns it off. Expect: the output events logged, `supportsDolby` stays false, **no reload**, sound follows the output, no error. Practical Magic 2 (AAC 5.1, direct play): same, no reload.
  2. **Temporary build, never committed**: `readDolby` alternates its answer on each read after an event (so one headset connect looks like "Dolby gained", and a second one looks like "lost"). On The Pitt: each change reloads at the current position (within a few seconds of it), the overlay/track state is kept, `/Sessions` shows one session at a time and the old transcode ends, sound comes back. Do it once in HLS (The Pitt) and, if you find a direct-play title with AC-3/E-AC-3, once in direct play. Then reinstall the clean build.
  3. Leaving the player logs the observer unregistering; playing again registers it again; no "already registered" error.
  4. A screenshot of the player after a reload (keep it in your scratchpad; it may show the server address).
- Leave the TV with the clean branch build, signed in as `demo` on the test server, headset off (ask the user). List any resume points that changed.

## Rules
- Only the files in Scope (plus this brief). One commit ("Reload at the position when the audio output's Dolby support changes"; the README line may be a second commit), no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build/licences/vpt results, the device results per step (times, what reloaded, sound as the user reported it), the paused-state choice, edge cases you thought about and suggested further tests, anything odd.
