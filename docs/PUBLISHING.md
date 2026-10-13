# Publishing to the Amazon Appstore

Checklist for submitting Caravela to the Amazon Appstore for Fire TV (Vega OS). Written 2026-10-12 against the Vega SDK 0.24 docs; re-check them before submitting, since the Vega docs are still an open beta and may change.

Sources:
- [App Submission for Vega](https://developer.amazon.com/docs/vega/0.24/app-submission.html)
- [Test Your App Before Submitting](https://developer.amazon.com/docs/vega/0.24/test-before-submission.html)
- [General requirements for media apps](https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html)
- [Version Your App](https://developer.amazon.com/docs/vega/0.24/app-version.html)
- [Submit Your App to the Amazon Appstore](https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html)

## Plan to v1.0

Written 2026-10-13. Work top to bottom: each phase unblocks the next. Code tasks follow "How we work" in `docs/HANDOFF.md` (approach first, ≤3 source files per subtask, briefs in `docs/tasks/`). Numbered `R1`… so they don't clash with the feature tasks in `docs/PLAN.md`.

### Phase 0: go / no-go (the user, no code)

Settle these first; if R0-1 is a no, the rest of this plan changes.

- [ ] **R0-1 Shaka polyfills.** Every VPKG bundles Amazon's proprietary Shaka polyfills and wrapper ("AMAZON PROPRIETARY/CONFIDENTIAL"); the release workflow keeps GitHub releases as drafts for that reason. Confirm Amazon allows them in an Appstore build (read the Vega SDK licence; if unclear, ask on the Amazon Developer forum). If not, the fallback is a direct-play-only build without Shaka, which loses remux/transcode and most of the library: not worth shipping.
- [ ] **R0-2 GPL compliance.** Publishing a binary means offering its source: the GitHub repo at the released tag, plus `scripts/setup-shaka.sh` for the parts we can't commit. Check `LICENSE-EXCEPTION.md` covers linking the polyfills into a distributed build.
- [ ] **R0-3 Accounts and hosting.** An Amazon Developer account, and somewhere to host a privacy policy (e.g. GitHub Pages on the repo).
- [ ] **R0-4 v1 scope.** Decide what the first version has. Recommended: what works today + R1–R6. Task 12 (segments, next up, still watching), the rest of task 14 and the Follow-ups in `docs/HANDOFF.md` wait for 1.1.

### Phase 1: store blockers (code)

Without these the app fails review or can't be uploaded.

- [ ] **R1 Background and foreground.** `PlayerScreen` listens to `AppState`. On `background`: note the position, `controller.destroy()` (already Shaka unload/destroy → pause → clear surface → `deinitialize()`, which matches Amazon's order), send stopped with that position so the server keeps the resume point, and go back to the details page. On `active` the details page refetches and its Resume shows the new position. Also check nothing else keeps running in the background (query refetch timers, the clock, progress reporting). Most lifecycle tests depend on this. Touches `PlayerScreen.tsx` and maybe a small `useAppBackground` hook, plus tests.
- [ ] **R2 Manifest and versioning.** Add `com.amazon.media.playersession.service` and `com.amazon.audio.system` to `[wants]` (Amazon's media requirements list both; Vega already logs the missing `audio.system`). Give the build a build number ≥ 1 that goes up on every upload: `build:release` and the release workflow pass `--build-number` (confirm the flag in the Vega CLI reference; the workflow could use `github.run_number`). Check the result with `vega exec vpt info <vpkg> --json`. Set the v1 version (`1.0.0`) in `manifest.toml` and `package.json` at release time.
- [ ] **R3 Search (task 13, minimal).** The toolbar opens a placeholder, and reviewers reject features that don't work. Minimal: a text field with the on-screen keyboard, `searchTerm` over movies, series and episodes, results as rows of cards that open Details. No search history or voice. If time matters more, the alternative is hiding the Search button for v1; building it is recommended, since it's basic for a library client.
- [ ] **R4 About in Settings.** App version and build number, server version, "Unofficial client, not affiliated with the Jellyfin project", GPL-2.0-or-later with a link to the source, third-party licences (Jellyfin SDK, Shaka, React Native, TanStack Query…), privacy policy link. One new section, plus a generated licences list.

### Phase 2: playback requirements (code, after R1)

- [ ] **R5 Audio codec selection.** Amazon requires choosing AAC or Dolby from the HDMI/AVR's capability and switching when the output changes (HDMI ↔ Bluetooth) during playback. First find out what decides E-AC-3 today (passed through with sound in task 7.5, but 10f-1 says it's always converted to AAC). Then probe audio capability at each play, and on an output change reload at the current position the same way a track switch does. Find the Vega API for output changes in the docs during the task.
- [ ] **R6 Media Controls.** Hook the player into Vega Media Controls (`kepler_media_controls_1`, already in `needs`) so Alexa ("pause", "resume", "skip forward") and the system controls work, and Alexa interruptions pause and resume cleanly. Do it before the Phase 3 run; if the Alexa test passes without it, it can move to 1.1, but voice control is something reviewers try.

### Phase 3: certification run on the Fire TV (the user, with a Release build)

- [ ] Install the Release VPKG from R2 (not Debug) on the Fire TV Stick 4K Select.
- [ ] All nine lifecycle tests below, on direct play and on an HLS remux/transcode.
- [ ] A smoke pass as a new user on the public demo server: add server, sign in, Home, Movies, Shows, Details, play, subtitles, audio switch, Search, Settings, sign out. This is what the reviewer will do.
- [ ] Optional: Vega KPIs (time to first frame, UI fluidity on grids), see "Performance" in `docs/PLAN.md`.
- [ ] Fix what fails (`R7…` tasks), then repeat the failing tests.

### Phase 4: listing and submission (the user)

- [ ] **Privacy policy** published (R0-3): the app stores server addresses, user names and access tokens on the device, unencrypted; it sends nothing anywhere except the user's own Jellyfin server; no analytics.
- [ ] **Store assets:** the console lists the sizes; expect the icon (512×512 exists), a 1920×1080 Fire TV background, and 3+ 1920×1080 screenshots (the README's set from the demo server works, retaken on a Release build).
- [ ] **Description:** what it does, that it needs your own Jellyfin 12.0+ server, "unofficial, not affiliated with the Jellyfin project". Nothing that hints at piracy, and no "Vega".
- [ ] **Reviewer notes:** the stable demo server `https://demo.jellyfin.org/stable` (12.2.0 on 2026-10-13), user `demo`, no password. Its trickplay sheets answer with a bot-check page, so the seek bar has no thumbnails there; say so.
- [ ] Content rating questionnaire, then the "Developer Console" steps below.
- [ ] Tag the release in git and keep the source available (R0-2).

### After v1.0

Task 12, Settings (task 14), Content Launcher, and the Follow-ups in `docs/HANDOFF.md`, e.g. removing a saved server or user.

## Binary

- [ ] Release VPKG, not Debug (Debug loads JS from Metro and starts blank): `build/<arch>-release/caravela_<arch>.vpkg`.
- [x] `com.amazon.category.main` registered in `manifest.toml` (without it the app can't launch from the Fire TV home and fails submission).
- [ ] Version and build number higher than the last submission; check with `vega exec vpt info <vpkg> --json`.
- [ ] Tested on a physical Fire TV Stick 4K Select running Vega OS (the Virtual Device isn't enough).

## Lifecycle tests Amazon runs

Run each with on-demand content. Expected: no crash, no blank screen, no audio leaking onto the launcher, no A/V sync issues.

- [ ] Play → Back until the launcher → relaunch: app works normally.
- [ ] Play → Home → relaunch: no audio on the launcher, app works normally.
- [ ] Play → Home → play something in another app → Home → relaunch and resume: no audio overlap.
- [ ] HDMI unplug for 5 minutes during playback, then replug: playback paused, resumes from the same position.
- [ ] Switch TV input, or turn the TV off, for 5 minutes during playback, then come back: paused, resumes from the same position.
- [ ] Device restart → relaunch: still signed in, playback resumes.
- [ ] Pause, idle 5 minutes until the screensaver/Ambient → Back: still paused, no audio over the screensaver, back in the app.
- [ ] Alexa query during playback (e.g. "What's the weather?"): video pauses, no audio overlap, playback resumes after the card closes.
- [ ] Bluetooth soundbar/headset, connected before and during playback: audio routes correctly and stays in sync.

## Developer Console

1. [ ] Amazon Developer account at <https://developer.amazon.com>.
2. [ ] **Add a New App** → upload the VPKG.
3. [ ] **Target Your App** → **Edit supported devices** → **Amazon Fire TV** tab → choose the device under **Amazon Vega TV**.
4. [ ] **Appstore Details:** title, description, icons, Fire TV images and screenshots (the console lists the current sizes; `assets/image/app_icon.png` is 512×512). Don't mention "Vega" in any field.
5. [ ] Content rating questionnaire.
6. [ ] Privacy policy URL (the app stores server addresses, user names and access tokens, unencrypted; see README).
7. [ ] **Review & Submit.**
