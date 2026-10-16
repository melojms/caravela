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
- [x] **R0-3 Accounts and hosting** (2026-10-16). Amazon Developer account created. Privacy policy on GitHub Pages at https://melojms.github.io/caravela/privacy (source `site/privacy/index.html`, workflow `.github/workflows/pages.yml`).
- [ ] **R0-4 v1 scope.** Decide what the first version has. Recommended: what works today + R1–R6. Task 12 (segments, next up, still watching), the rest of task 14 and the Follow-ups in `docs/HANDOFF.md` wait for 1.1.

### Phase 1: store blockers (code)

Without these the app fails review or can't be uploaded.

- [ ] **R1 Background and foreground.** Split into R1-0 (Fire TV: log which events background the app: Home, another app, Alexa card, screensaver, HDMI unplug, TV input/power; and whether a request sent in the background reaches the server), R1-a (`PlayerScreen` leaves to the details page on `background`; the existing unmount path already destroys the player in Amazon's order, sends stopped with the position and refreshes details/Home), R1-b (only if R1-0 shows cases that don't change `AppState`, e.g. HDMI unplug), R1-c, R1-d (Fire TV lifecycle checks). Most lifecycle tests depend on this.
  - [x] **R1-0** (2026-10-16, Fire TV, probe branch `probe/r1-0b`, not merged): Home, another app, the screensaver and an Alexa voice search send `background`, and the player can leave on it (stopped reaches the server in ~0.3 s; JS is suspended ~4 s later). A plain Alexa question doesn't change `AppState`: Vega pauses the pipeline itself (`audiofocuspaused`, no `pause` event) and resumes it on `audiofocusgranted`, but our freeze check fails the player first ("Playback stopped"). HDMI unplug, TV input switch and TV off disconnect the display and **Vega kills the app** within ~10–120 ms, with no `background`; nothing the app can do, the last progress report keeps the resume point. Details in `docs/HANDOFF.md`. So R1-b has no display work; it becomes the Alexa audio-focus fix.
  - [x] **R1-a** (2026-10-16): `PlayerScreen` calls `goBack()` on `AppState` `background` in any phase, so unmount releases the player and sends stopped; relaunch lands on details (checked on the Fire TV in direct play and HLS, paused and while loading). The OS sometimes kills the app right after the release (`MRM killed`), so the next launch can be cold on Home. Brief `docs/tasks/r1a-leave-on-background.md`; details in `docs/HANDOFF.md`.
  - [x] **R1-b** (2026-10-16): an Alexa question no longer fails playback: the freeze check and stall watchdog stay off while Vega holds the player for the audio focus, and Vega resumes it by itself (checked on the Fire TV in direct play and HLS). Also fixed the remote's Play/Pause (it never resumed) and ⏪/⏩ (double seeks): those keys now belong to Vega's player session only. Brief `docs/tasks/r1b-audio-focus.md`; details in `docs/HANDOFF.md`.
  - [x] **R1-c** (2026-10-13): stale queries (older than 30 s) refetch when the app returns to the foreground: TanStack Query's `focusManager` follows `AppState` (`listenToAppState` in `src/api/queryClient.tsx`). Brief `docs/tasks/r1c-foreground-refetch.md`.
- [x] **R2 Manifest and versioning** (2026-10-13, briefs `docs/tasks/r2*.md`). `[wants]` has `com.amazon.media.playersession.service` and `com.amazon.audio.system` (their "missing wants" log lines are gone; `com.amazon.network.service` still logs one). `npm run build:release` runs `scripts/build-release.sh`, which passes `--build-version` (the `[package]` version in `manifest.toml`) and `--build-number` = major × 1000000 + minor × 1000 + patch (0.1.1 → 1001, 1.0.0 → 1000000); the release workflow checks both with `vpt info`. **Never change the formula once a version is on the store**: Amazon needs both numbers to go up. Versions stay semver (the user chose it over dates). v1.0.0 comes from running the release workflow with `major`.
- [x] **R3 Search (task 13, minimal)** (2026-10-16, briefs `docs/tasks/13*.md`). 13a `src/api/search.ts`: `useSearch(term)` runs `getItems` (`searchTerm`, limit 25, recursive) for movies, series and episodes in parallel, per-user keys; old results stay while a new term loads (a cache lookup, since `keepPreviousData` does nothing in `useQueries`). 13b `src/screens/SearchScreen.tsx`: field under the toolbar, 600 ms debounce, submit searches at once and focuses the first result (which closes the keyboard), Movies/Shows poster rows and an Episodes landscape row, hint / spinner / "No results" / per-row Retry. Search opens with the toolbar button focused (the user's choice); `showSoftInputOnFocus={false}` so the keyboard opens only on Enter. Episode search matches episode titles, not the series name (same as androidtv). No history, voice, people or collections.
- [x] **R4 About in Settings** (2026-10-16, briefs `docs/tasks/r4*.md`). Settings → About: version and build number (from `package.json` with `build-release.sh`'s formula), server name and Jellyfin version, "Unofficial client, not affiliated with the Jellyfin project.", GPL-2.0-or-later, source https://github.com/melojms/caravela, privacy policy **https://melojms.github.io/caravela/privacy** (shown in the app, so publish it there: R0-3 / Phase 4). Third-party licences: full texts of every package in the Release bundle plus Shaka, generated by `npm run licenses` (run it after dependency changes and before each release, after `npm run build:release`).

### Phase 2: playback requirements (code, after R1)

- [ ] **R5 Audio codec selection.** Amazon requires choosing AAC or Dolby from the HDMI/AVR's capability and switching when the output changes (HDMI ↔ Bluetooth) during playback. First find out what decides E-AC-3 today (passed through with sound in task 7.5, but 10f-1 says it's always converted to AAC). Then probe audio capability at each play, and on an output change reload at the current position the same way a track switch does. Find the Vega API for output changes in the docs during the task.
- [ ] **R6 Media Controls.** Hook the player into Vega Media Controls (`kepler_media_controls_1`, already in `needs`) so Alexa ("pause", "resume", "skip forward") and the system controls work, and Alexa interruptions pause and resume cleanly. Do it before the Phase 3 run; if the Alexa test passes without it, it can move to 1.1, but voice control is something reviewers try. Since R1-b the remote's media keys are handled only by w3cmedia's legacy player session, which turns itself off once the manifest declares a Media Controls component: R6 must then handle those keys in exactly one place.

### Phase 3: certification run on the Fire TV (the user, with a Release build)

- [ ] Install the Release VPKG from R2 (not Debug) on the Fire TV Stick 4K Select.
- [ ] All nine lifecycle tests below, on direct play and on an HLS remux/transcode.
- [ ] A smoke pass as a new user on the public demo server: add server, sign in, Home, Movies, Shows, Details, play, subtitles, audio switch, Search, Settings, sign out. This is what the reviewer will do.
- [ ] Optional: Vega KPIs (time to first frame, UI fluidity on grids), see "Performance" in `docs/PLAN.md`.
- [ ] Fix what fails (`R7…` tasks), then repeat the failing tests.

### Phase 4: listing and submission (the user)

- [ ] **Privacy policy** published (R0-3) at https://melojms.github.io/caravela/privacy (the URL About shows since R4): the app stores server addresses, user names and access tokens on the device, unencrypted; it sends nothing anywhere except the user's own Jellyfin server; no analytics. Source: `site/privacy/index.html`, deployed by `.github/workflows/pages.yml` (only `site/` is published; Settings → Pages → Source must be "GitHub Actions"). Update its "Last updated" date with any change.
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
- [ ] `npm run licenses` after the release build leaves `src/about/licenses.json` unchanged (commit it if not).
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
