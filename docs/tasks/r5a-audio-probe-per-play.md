# Task R5a: probe the audio codecs at each play, and say whether Dolby is supported now

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r5a (branch `task/r5a-audio-probe-per-play`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R5, Phase 2). **R5b runs in parallel** in `/home/melojms/projects/melojms-git/caravela-wt/task-r5b` and owns `src/playback/audioOutput.ts`, `package.json` / `package-lock.json`, `manifest.toml` and `test/about/licenses.spec.ts`: don't edit those. R5c (later) wires both into `PlayerScreen` and does the Fire TV check.
**No device check in this task**; R5c checks it on the Fire TV.

## Why
Amazon requires the app to pick AAC or Dolby from the current audio output's capability (Vega docs, media-player requirements, "Codec Selection"), and to switch when the output changes (HDMI ↔ Bluetooth).

The R5-0 probe (branch `probe/r5`, Fire TV, 2026-10-17) showed:
- `MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')` (and `ac-3`) goes through w3cmedia's `MimeTypeRegistry.isCodecSupportedByPlatform` to `KeplerMediaDescriptor.queryMediaCapabilitiesSync`, which reads the **current output's** supported formats **live on every call** (20 PCM configs on HDMI, 1 on a Bluetooth headset, back to 20). Vega caches nothing.
- Our `getDeviceCapabilities()` in `src/playback/deviceProfile.ts` probes **once per app run** and caches it, and `buildDeviceProfile()` caches the whole profile. So the Dolby answer from the first play sticks until the app is killed. That's why task 7.5 saw E-AC-3 passed through and 10f-1 saw it converted: the TV offered E-AC-3 over HDMI on one day and not the other.
- Cost on the Fire TV: one KMD query 3–4 ms warm (30–44 ms on the first call of a run), `isTypeSupported` 20–40 ms; all ~18 probes ~125 ms. The video probes don't depend on the output, so they can stay cached.
- Vega drops an app's log lines above 300/s, and each KMD query logs ~8 native lines; keep the number of probes per play small (only the audio ones).

## Approach (approved)
1. **`src/playback/deviceProfile.ts`**:
   - Split the probes into video and audio. Video probes (and the levels) stay cached once per app run as today; the **audio** probes (`aac`, `mp3`, `ac3`, `eac3`, `opus`, `flac`, `dts`, `truehd`) run again every time `getDeviceCapabilities()` / `buildDeviceProfile()` is called without an injected `isTypeSupported`. `buildDeviceProfile()` must no longer return a profile cached across calls (the resolver calls it once per PlaybackInfo request, i.e. per play, track switch and Retry: that's the "each play" we want).
   - Export **`supportsDolby(isTypeSupported?: IsTypeSupported): boolean`**: true when AC-3 **or** E-AC-3 is supported right now (fresh probes of just those two; default `MediaSource.isTypeSupported`). R5c compares its value before and after an output change; R5b gets it passed in. Keep the name and signature exactly, since R5b/R5c are written against it.
   - Keep `PROBES`, `probeCapabilities`, `createDeviceProfile` and their behaviour; `probeCapabilities(isTypeSupported)` with an injected function still probes everything (the tests use it).
   - Update the doc comments ("probed once per app run" etc.).
2. **Tests first**, see them fail, in `test/playback/deviceProfile.spec.ts` (mock `MediaSource.isTypeSupported` from the existing w3cmedia Jest mock `test/__mocks__/react-native-w3cmedia.ts`, which you may extend):
   - two `buildDeviceProfile()` calls with `ec-3` flipping between them → the second profile's audio codecs follow (direct play and HLS profiles);
   - video probes run once across calls, audio probes run on each call (count calls per MIME string);
   - `supportsDolby()`: only ac-3, only ec-3, both, neither, and a probe that throws → false;
   - existing tests still pass (adjust only those that asserted the old profile caching, and say which).

## Scope (only this)
`src/playback/deviceProfile.ts`, plus `test/playback/deviceProfile.spec.ts` and `test/__mocks__/react-native-w3cmedia.ts` if needed. If `src/playback/resolver.ts` has a comment about the profile being cached, you may fix that comment only.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors), full `npm test` (known flaky specs: Follow-ups in `docs/HANDOFF.md`; rerun them alone), `npm run build:release`.

## Rules
- Only the files in Scope (plus this brief). One commit ("Probe the audio codecs at each play"), no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, edge cases you thought about and suggested further tests, anything odd.
