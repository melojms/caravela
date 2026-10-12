# Publishing to the Amazon Appstore

Checklist for submitting Caravela to the Amazon Appstore for Fire TV (Vega OS). Written 2026-10-12 against the Vega SDK 0.24 docs; re-check them before submitting, since the Vega docs are still an open beta and may change.

Sources:
- [App Submission for Vega](https://developer.amazon.com/docs/vega/0.24/app-submission.html)
- [Test Your App Before Submitting](https://developer.amazon.com/docs/vega/0.24/test-before-submission.html)
- [General requirements for media apps](https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html)
- [Version Your App](https://developer.amazon.com/docs/vega/0.24/app-version.html)
- [Submit Your App to the Amazon Appstore](https://developer.amazon.com/docs/app-submission/submitting-apps-to-amazon-appstore.html)

## Gaps found on 2026-10-12

Fix these before submitting. Tick them off as they land.

- [ ] **Release the player in the background (blocker).** Nothing in `src/` listens to `AppState`. On Home/background the app must release media resources (`shakaPlayer.detach()`, `unload()`, `destroy()`, `videoPlayer.deinitialize()`), go back to the details page for VOD, and keep the resume position so playback can pick up where it left off. Most lifecycle tests below depend on this.
- [ ] **Build number.** `build/*-release/vpkg-info.json` shows `"build_number": 0`; it must be ≥ 1 and go up with every submission. Add `--build-version X.Y.Z --build-number N` to `build:release` in `package.json`.
- [ ] **Manifest services.** Add to `[wants]` in `manifest.toml`: `com.amazon.media.playersession.service` and `com.amazon.audio.system`.
- [ ] **Media Controls.** `manifest.toml` needs `kepler_media_controls_1`, but no code uses it. Not listed as mandatory, but Alexa voice commands ("pause", "skip forward") and system playback controls go through it, so expect it to matter for the Alexa test.
- [ ] **Audio codec switching.** Choose AAC or Dolby from the HDMI/AVR capability, and switch codec when the output changes between HDMI and Bluetooth during playback.
- [ ] **Feature completeness.** Player controls, Search and Settings are still "coming next" in the README. A store build should at least have Search and a Settings screen with sign-out and an about/licences page.

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

## Beyond Amazon's checklist

- [ ] **Reviewer access.** Give reviewers a public Jellyfin 12.0+ server and a login in the testing notes; Caravela rejects older servers. Check whether the Jellyfin demo server is on 12.0+.
- [ ] **Shaka polyfills.** A built VPKG contains Amazon's proprietary Shaka polyfills (see README, "Shaka Player (not included)"). Confirm Amazon's terms allow distributing them in a store build, and keep the GPL source available alongside it.
- [ ] **Wording.** Keep "unofficial, not affiliated with the Jellyfin project" in the store description, and don't word it in a way that suggests pirated content (reviewers reject apps that seem to promote it).
