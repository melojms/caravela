# Task 7.5g: README series and episode screenshots from the Jellyfin demo server

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075g (branch `task/075g-readme-screenshots`, from `main`).
Background: read docs/HANDOFF.md first, especially "Vega Virtual Device (simulator)" under Gotchas. Platform: Vega OS, React Native 0.83, Vega SDK 0.24.
The user has **already approved** this. Don't ask again for approval of the overall approach.
**Simulator only. Do not use the Fire TV.**

## Why
`README.md` says its screenshots show content from the official Jellyfin demo server, but `docs/screenshots/readme/series.jpg` and `episode.jpg` came from the user's test server. Replace both with the same pages on the demo server.

## Setup
- `npm ci`, `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, `npm run build:release`.
- Simulator flows inside `flock /tmp/caravela-sim.lock -c '…'`; `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice` (wipes storage). Input: `vega exec vda -s emulator-5554 shell inputd-cli …` (Select is `KEY_ENTER`). Screenshots: the XWayland window capture in HANDOFF; crop off the on-screen remote.
- Add the server **`demo.jellyfin.org/stable`** (https) and sign in as **`demo` with an empty password**.

## Shots
The demo server has one series: **Pioneer One** (1 season, 6 episodes).
1. `series.jpg`: the Pioneer One series page as it opens (Play focused, header, the first row visible). Reach it via Home → My media → Shows (or whichever library holds it) → Pioneer One.
2. `episode.jpg`: **S1E2 "The Man From Mars"** episode page as it opens (Play focused, so Previous episode and Go to series are visible, Next episodes row underneath).
- **Don't change anything on the server** (no Watched/Favorite toggles, no playback): it's a public shared server.
- Output: **1280×720 JPEG**, progressive, quality 85, metadata stripped (`convert in.png -resize 1280x720 -strip -interlace Plane -quality 85 out.jpg`), matching the other files in `docs/screenshots/readme/`. Look at each image yourself: page fully loaded (images in, no spinner), nothing cut off, no server address, no avatar. Note the content wording in README alt text and fix the alt text if it no longer fits.

## Rules
- Files: `docs/screenshots/readme/series.jpg`, `docs/screenshots/readme/episode.jpg`, and README alt text only if needed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
The two output paths, how each looks (one line each), and anything odd seen on the demo server.
