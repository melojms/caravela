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
  - 2026-10-18, read (not legal advice): the SDK's `LICENSE.txt` and the polyfill headers point to the [Program Materials License Agreement](https://developer.amazon.com/support/legal/pml) (PML, updated 2020-01-09). Its grant says materials "we make available specifically for incorporation in Your Products (as indicated by the applicable documentation)" may be incorporated and distributed "as incorporated in Your Products"; Amazon's Shaka page tells apps to copy the polyfills in, so a VPKG on the Appstore fits. The same covers the four bundled `@amazon-devices/*` JS packages. **Open:** the headers say "AMAZON PROPRIETARY/CONFIDENTIAL", and the PML's Restricted Program Materials Schedule covers anything Amazon "designate[s] as confidential": then distribution needs Amazon's written approval, and source-form files may only ship in binary form. The package is a public download with no NDA, so probably boilerplate, but unconfirmed. Keeping them out of the repo and the GitHub releases as drafts suits either reading.
  - 2026-10-18: the user sent this question to Amazon; R0-1 waits on the answer. The question (Developer Console → Contact Us gives a written answer, or the Vega forum): *"My Vega app bundles the polyfills from `shaka-rel-v4.16.13-r1.2-devices_scope.tar.gz` as your Shaka Player docs describe. Their headers say 'AMAZON PROPRIETARY/CONFIDENTIAL'. Are they Restricted Program Materials under the PML, or materials 'made available specifically for incorporation in Your Products' that I may distribute in my app's VPKG on the Appstore? My app's own code is open source (GPL-2.0-or-later with an exception that keeps your files out of the GPL); the polyfills are not published in my repository."*
- [x] **R0-2 GPL compliance** (2026-10-18, the user accepted the androidtv-derived lines). Publishing a binary means offering its source: the GitHub repo at the released tag, plus `scripts/setup-shaka.sh` for the parts we can't commit. Check `LICENSE-EXCEPTION.md` covers linking the polyfills into a distributed build.
  - 2026-10-18, read (not legal advice): the PML forbids using Program Materials with open-source licences that "would require you or us to disclose, license, distribute… any part of such Program Materials", which plain GPL would for the combined bundle (the GPL's system-library exception doesn't cover polyfills bundled in the app). `LICENSE-EXCEPTION.md` removes that, and it holds for Caravela's own code: every human commit is the user's, and contributions are bound by the exception.
  - **The weak spot is code derived from jellyfin-androidtv** (GPL-2.0; its sources carry no "only"/"or later" notice, so under GPL-2.0 §9 any version may be chosen, which makes "or later" defensible). The user can't add an exception for Jellyfin's contributors. A read-only comparison found:
    - `src/playback/resolver.ts`: the PlaybackInfo → direct play / direct stream / transcode order that every Jellyfin client follows (the server API dictates it), in its own structure with Vega-specific URLs, token and tracks. Low risk. The three `PLAYBACK_ERROR_MESSAGES` strings are androidtv's (`strings.xml`, e.g. `msg_playback_not_allowed`): reword them.
    - `src/playback/deviceProfile.ts`: the probes, containers, subtitle profiles and Vega workarounds are original. `codecProfiles` and `unsupportedRangeTypesAv1` / `Hevc` follow androidtv's `deviceProfile.kt` section by section (same profiles, order, conditions and values, the same nested HDR exclude-list logic), and `HLS_TS_AUDIO` / `HLS_FMP4_AUDIO` are its lists. Most of it is server-protocol data with little room for other expression (androidtv's own comment calls the HDR part a workaround for the server), but it is the one part that reads as a translation, ~200 lines.
  - Decision for the user: (a) accept: it's functional protocol data; (b) a small code task: reword the error strings and rewrite the codec/HDR profiles table-driven from the server's DeviceProfile semantics (not clean-room, but less literal); (c) ask the jellyfin-androidtv maintainers whether they object to those lines shipping beside Amazon's polyfills. **The user chose (a)** on 2026-10-18. The source offer itself is covered: About shows the source URL, Phase 4 tags the release, and `setup-shaka.sh` plus the build scripts are in the repo.
- [x] **R0-3 Accounts and hosting** (2026-10-16). Amazon Developer account created. Privacy policy on GitHub Pages at https://melojms.github.io/caravela/privacy (source `site/privacy/index.html`, workflow `.github/workflows/pages.yml`).
- [x] **R0-4 v1 scope** (2026-10-19, the user): v1.0 is the app on `main` as it is (R1–R6, R7-d/e/f). Task 12 (segments, next up, still watching), the rest of task 14, R7-a, R7-c and the Follow-ups in `docs/HANDOFF.md` wait for 1.1.

### Phase 1: store blockers (code)

Without these the app fails review or can't be uploaded.

- [ ] **R1 Background and foreground.** Split into R1-0 (Fire TV: log which events background the app: Home, another app, Alexa card, screensaver, HDMI unplug, TV input/power; and whether a request sent in the background reaches the server), R1-a (`PlayerScreen` leaves to the details page on `background`; the existing unmount path already destroys the player in Amazon's order, sends stopped with the position and refreshes details/Home), R1-b (only if R1-0 shows cases that don't change `AppState`, e.g. HDMI unplug), R1-c, R1-d (Fire TV lifecycle checks). Most lifecycle tests depend on this.
  - [x] **R1-0** (2026-10-16, Fire TV, probe branch `probe/r1-0b`, not merged): Home, another app, the screensaver and an Alexa voice search send `background`, and the player can leave on it (stopped reaches the server in ~0.3 s; JS is suspended ~4 s later). A plain Alexa question doesn't change `AppState`: Vega pauses the pipeline itself (`audiofocuspaused`, no `pause` event) and resumes it on `audiofocusgranted`, but our freeze check fails the player first ("Playback stopped"). HDMI unplug, TV input switch and TV off disconnect the display and **Vega kills the app** within ~10–120 ms, with no `background`; nothing the app can do, the last progress report keeps the resume point. Details in `docs/HANDOFF.md`. So R1-b has no display work; it becomes the Alexa audio-focus fix.
  - [x] **R1-a** (2026-10-16): `PlayerScreen` calls `goBack()` on `AppState` `background` in any phase, so unmount releases the player and sends stopped; relaunch lands on details (checked on the Fire TV in direct play and HLS, paused and while loading). The OS sometimes kills the app right after the release (`MRM killed`), so the next launch can be cold on Home. Brief `docs/tasks/r1a-leave-on-background.md`; details in `docs/HANDOFF.md`.
  - [x] **R1-b** (2026-10-16): an Alexa question no longer fails playback: the freeze check and stall watchdog stay off while Vega holds the player for the audio focus, and Vega resumes it by itself (checked on the Fire TV in direct play and HLS). Also fixed the remote's Play/Pause (it never resumed) and ⏪/⏩ (double seeks): those keys now belong to Vega's player session only. Brief `docs/tasks/r1b-audio-focus.md`; details in `docs/HANDOFF.md`.
  - [x] **R1-d** (2026-10-18): the nine lifecycle tests below on a clean Release build on the Fire TV, both items HLS (no real direct play). No crash, blank screen or audio leak. Open: R7-a (audio lag after a mid-play headset connect, HLS with transcoded audio), R7-b (HDMI unplug / TV input / TV off kill the app; decision), R7-c (stale server session after a kill). Brief `docs/tasks/r1d-lifecycle-run.md`; details in `docs/HANDOFF.md`.
  - [x] **R7-d/e/f** (2026-10-18): return from the background (Home, another app, the screensaver) shows the player paused at the same position (R7-d, replaces R1-a's `goBack()`); Home focus follows the item when Continue watching reorders (R7-e); Details' "Ends" time stays current (R7-f). Brief `docs/tasks/r7def-lifecycle-ui.md`.
  - [ ] **R7-a** audio behind the lips after a Bluetooth headset connects mid-play (HLS with transcoded audio): measure, then fix. **Deferred** (the user, 2026-10-18): not fixed for v1.0; a known risk for Amazon's Bluetooth test.
  - [x] **R7-b** (2026-10-18, decision): HDMI unplug / TV input / TV off: Vega kills the app. The user accepts it: the next launch is a cold start on Home and Resume continues from the last progress report (~0.5–4 s behind). No code; worth a line in the reviewer notes.
  - [ ] **R7-c** (low) send stopped before a kill, or accept the server's ~6 min session timeout.
  - [x] **R1-c** (2026-10-13): stale queries (older than 30 s) refetch when the app returns to the foreground: TanStack Query's `focusManager` follows `AppState` (`listenToAppState` in `src/api/queryClient.tsx`). Brief `docs/tasks/r1c-foreground-refetch.md`.
- [x] **R2 Manifest and versioning** (2026-10-13, briefs `docs/tasks/r2*.md`). `[wants]` has `com.amazon.media.playersession.service` and `com.amazon.audio.system` (their "missing wants" log lines are gone; `com.amazon.network.service` still logs one). `npm run build:release` runs `scripts/build-release.sh`, which passes `--build-version` (the `[package]` version in `manifest.toml`) and `--build-number` = major × 1000000 + minor × 1000 + patch (0.1.1 → 1001, 1.0.0 → 1000000); the release workflow checks both with `vpt info`. **Never change the formula once a version is on the store**: Amazon needs both numbers to go up. Versions stay semver (the user chose it over dates). v1.0.0 comes from running the release workflow with `major`.
- [x] **R3 Search (task 13, minimal)** (2026-10-16, briefs `docs/tasks/13*.md`). 13a `src/api/search.ts`: `useSearch(term)` runs `getItems` (`searchTerm`, limit 25, recursive) for movies, series and episodes in parallel, per-user keys; old results stay while a new term loads (a cache lookup, since `keepPreviousData` does nothing in `useQueries`). 13b `src/screens/SearchScreen.tsx`: field under the toolbar, 600 ms debounce, submit searches at once and focuses the first result (which closes the keyboard), Movies/Shows poster rows and an Episodes landscape row, hint / spinner / "No results" / per-row Retry. Search opens with the toolbar button focused (the user's choice); `showSoftInputOnFocus={false}` so the keyboard opens only on Enter. Episode search matches episode titles, not the series name (same as androidtv). No history, voice, people or collections.
- [x] **R4 About in Settings** (2026-10-16, briefs `docs/tasks/r4*.md`). Settings → About: version and build number (from `package.json` with `build-release.sh`'s formula), server name and Jellyfin version, "Unofficial client, not affiliated with the Jellyfin project.", GPL-2.0-or-later, source https://github.com/melojms/caravela, privacy policy **https://melojms.github.io/caravela/privacy** (shown in the app, so publish it there: R0-3 / Phase 4). Third-party licences: full texts of every package in the Release bundle plus Shaka, generated by `npm run licenses` (run it after dependency changes and before each release, after `npm run build:release`).

### Phase 2: playback requirements (code, after R1)

- [x] **R5 Audio codec selection** (2026-10-17). Amazon requires choosing AAC or Dolby from the HDMI/AVR's capability and switching when the output changes (HDMI ↔ Bluetooth) during playback. The probe (`probe/r5`) showed that Vega answers `isTypeSupported` for AC-3/E-AC-3 live from the current output, but the app cached it once per app run (why task 7.5 passed E-AC-3 through and 10f-1 converted it). R5a probes the audio codecs at each play (`supportsDolby()`); R5b watches the output with `AudioManager.registerAudioEventObserverAsync` (`keplerscript-audio-lib`, no privilege declared); R5c reloads a playing AC-3/E-AC-3 track at the position (5 s earlier) when Dolby support changes either way. Checked on the Fire TV with a Bluetooth headset; this TV offers no Dolby over HDMI, so the real Dolby switch is unit-tested and was run with a temporary build that faked the change. Briefs `docs/tasks/r5*.md`; details in `docs/HANDOFF.md`.
- [x] **R6 Media Controls.** Hook the player into Vega Media Controls (`kepler_media_controls_1`, already in `needs`) so Alexa ("pause", "resume", "skip forward") and the system controls work, and Alexa interruptions pause and resume cleanly. Do it before the Phase 3 run; if the Alexa test passes without it, it can move to 1.1, but voice control is something reviewers try. Since R1-b the remote's media keys are handled only by w3cmedia's legacy player session, which turns itself off once the manifest declares a Media Controls component: R6 must then handle those keys in exactly one place.
  - [x] **R6** (2026-10-17): Alexa "pause", "play" / "resume", "stop" (pauses), "skip forward / rewind N seconds" and the remote's ⏯ ⏩ (+30 s) ⏪ (−10 s) go through Vega Media Controls to `PlayerController`, once each; a voice pause stays paused (no freeze error) and Vega is told it's paused. Checked on the Fire TV in direct play and HLS. Briefs `docs/tasks/r6*.md`; details in `docs/HANDOFF.md`.

### Phase 3: certification run on the Fire TV (the user, with a Release build)

- [x] Install the Release VPKG from R2 (not Debug) on the Fire TV Stick 4K Select (2026-10-19, 0.1.1 / 1001, `vpt info` checked, `npm run licenses` no diff).
- [x] All nine lifecycle tests below, on direct play (Practical Magic 2, DirectPlay) and HLS (Another Simple Favor, transcode) (2026-10-19). No crash, ANR, blank screen, audio leak or A/V sync problem; R7-d's paused player came back after Home, another app and the screensaver. One `MRM killed` in 8 backgrounds (screensaver, HLS) gave a cold start instead (R7-g). Display kills as accepted in R7-b, Resume 0–1.2 s behind. R7-a didn't show. Brief `docs/tasks/p3-certification-run.md`.
- [x] A smoke pass as a new user on the public demo server (2026-10-19): fresh install, add server, sign in, Home, Movies (sort, filter, letter), Details, play (direct play), Shows → Pioneer One → episode, Search, Settings, About, licences, sign out all work. No demo item has subtitles or a second audio track, so those pickers weren't exercised there (they were on the test server in tasks 10 and R5). Sign-in focus is the reviewer's first stumble (R7-h).
- [x] Optional: Vega KPIs: skipped for v1.0 (the user, 2026-10-19).
- [ ] Fix what fails (`R7…` tasks), then repeat the failing tests. From the run, none judged a blocker; the user decides which go into v1.0:
  - [ ] **R7-g** OS kill (`MRM killed`) right after a background (1 in 8): release more memory on `background` so the screensaver/Home tests land on the paused player more often.
  - [x] **R7-h** (2026-10-20): Down from the password field lands on Sign in (`nextFocusDown`; `FocusManager.setNextFocus` is ignored from a TextInput on the Fire TV), on the picker path and on Add user. Quick Connect stays first for every user: Jellyfin 12.2 reports `HasPassword: true` for every public user, `demo` included, so a password-less user can't be detected (the user's choice; the reviewer notes explain "Use password"). Brief `docs/tasks/r7h-signin-focus.md`.
  - [ ] **R7-i** (low) Home's first focus after a cold start sometimes isn't My media (an early Down skips rows still loading).
  - [ ] **R7-j** (low) Settings opens with nothing visibly focused.
  - [ ] **R7-k** (low) letter-filter subtitle reads clumsily; the letter bar covers the library title.
  - [x] **R7-l** (2026-10-20): the app sends the device name `Fire TV` instead of `Fire TV (Vega)`, and the privacy policy quotes the new name (no "Vega" anywhere a reviewer looks). Checked on the Fire TV: the server shows the new name with the existing token. Brief `docs/tasks/r7l-device-name.md`.

### Phase 4: listing and submission (the user)

Drafts for every console field (description, reviewer notes, keywords, content rating, image list) are in `docs/STORE-LISTING.md` (2026-10-19).


- [x] **Privacy policy** published (2026-10-19, live; updated 2026-10-20 for R7-l, deploys on the next push of `main`) at https://melojms.github.io/caravela/privacy (the URL About shows since R4): the app stores server addresses, user names and access tokens on the device, unencrypted; it sends nothing anywhere except the user's own Jellyfin server; no analytics. Source: `site/privacy/index.html`, deployed by `.github/workflows/pages.yml` (only `site/` is published; Settings → Pages → Source must be "GitHub Actions"). Update its "Last updated" date with any change.
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

Last run 2026-10-19 on 0.1.1 (1001), results in `docs/tasks/p3-certification-run.md`; HDMI / TV input / TV off kill the app (R7-b, accepted).

- [x] Play → Back until the launcher → relaunch: app works normally.
- [x] Play → Home → relaunch: no audio on the launcher, app works normally.
- [x] Play → Home → play something in another app → Home → relaunch and resume: no audio overlap.
- [ ] HDMI unplug for 5 minutes during playback, then replug: playback paused, resumes from the same position. Not met: Vega kills the app (R7-b, accepted).
- [ ] Switch TV input, or turn the TV off, for 5 minutes during playback, then come back: paused, resumes from the same position. Not met: Vega kills the app (R7-b, accepted).
- [x] Device restart → relaunch: still signed in, playback resumes.
- [ ] Pause, idle 5 minutes until the screensaver/Ambient → Back: still paused, no audio over the screensaver, back in the app. Passed except once: an `MRM killed` gave a cold start, position kept (R7-g).
- [x] Alexa query during playback (e.g. "What's the weather?"): video pauses, no audio overlap, playback resumes after the card closes.
- [x] Bluetooth soundbar/headset, connected before and during playback: audio routes correctly and stays in sync.

## Developer Console

1. [ ] Amazon Developer account at <https://developer.amazon.com>.
2. [ ] **Add a New App** → upload the VPKG.
3. [ ] **Target Your App** → **Edit supported devices** → **Amazon Fire TV** tab → choose the device under **Amazon Vega TV**.
4. [ ] **Appstore Details:** title, description, icons, Fire TV images and screenshots (the console lists the current sizes; `assets/image/app_icon.png` is 512×512). Don't mention "Vega" in any field.
5. [ ] Content rating questionnaire.
6. [ ] Privacy policy URL (the app stores server addresses, user names and access tokens, unencrypted; see README).
7. [ ] **Review & Submit.**
