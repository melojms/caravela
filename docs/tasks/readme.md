# Task: an appealing README with the logo, screenshots and Buy Me a Coffee

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-readme (branch `task/readme`, from `main`).
Background: read docs/HANDOFF.md first (especially "Shared Fire TV", "Screenshot (Fire TV)", "Remote input" and the privacy rules under "Decisions and preferences"), then the current README.md and docs/PLAN.md ("Delivery").
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

## Goal
Make README.md the project's front page on GitHub (https://github.com/melojms/caravela): attractive, honest about the app being a **work in progress**, with the logo, fresh screenshots from the Fire TV and a Buy Me a Coffee link.

## README layout
1. **Header, centred** (HTML `<p align="center">` is fine on GitHub):
   - The Sail icon `assets/brand/caravela-icon.svg` at about 128 px.
   - "Caravela" and a one-line tagline (a Jellyfin client for Fire TV on Vega OS, movies and TV shows).
   - Badges (shields.io): licence GPL-2.0-or-later, platform Fire TV · Vega OS, Jellyfin 12.0+, and **status: work in progress**.
   - The Buy Me a Coffee button linking to https://www.buymeacoffee.com/melojms. Use the official button image (`https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png`, height about 40 px).
   - Keep the "unofficial, not affiliated with the Jellyfin project" line.
2. **Screenshots**: a 2×2 grid (HTML table or images side by side) with short captions: Home, movie details, the paused player, and sign-in (Quick Connect or the user picker).
3. **Status**: a clear "work in progress" note. List what works today, from HANDOFF.md "Done": sign-in with Quick Connect/password and multiple servers/users, Home rows from the server, movie details, playback (direct play, plus server remux/transcode over HLS with Shaka) with resume and progress reporting. Then a short roadmap from PLAN.md "Delivery" (subtitles and audio tracks, player controls with trickplay and chapters, intro skip and next up, TV show details, library grids, search, settings). Not yet on the Appstore; sideload only.
4. **Features** at a glance (short bullets; only things that exist).
5. The existing sections, kept and tidied but **with their content intact**: Requirements, Build and run, Shaka Player (not included), Jellyfin API and saved logins.
6. **Support**: a short paragraph with the Buy Me a Coffee button again.
7. **License**: keep the current text (GPL-2.0-or-later, the linking exception, the Shaka note) word for word.

Keep the tone plain and friendly, no hype. Don't claim anything the app doesn't do.

## Screenshots (Fire TV)
- **Content from Jellyfin's public demo server**, never the user's server: `https://demo.jellyfin.org/stable` (Jellyfin 12.2, user `demo` with an **empty** password; it's a public account, so the Password screen is fine here. Quick Connect can't be approved on it). The user's own account rule still applies: never use the user's password.
- The TV already has Caravela installed and signed in to the user's server. **Don't reinstall** (`run-app` wipes the sign-in). If the installed build is older than `main`, build in this worktree (`npm ci`, `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, `npm run build:release`) and upgrade with `vega device install-app` (keeps the sign-in).
- Add the demo server inside the app (avatar → user picker → add server, or Settings → switch user) and sign in as `demo`. When done, switch back to the user's account on their saved server (the token is saved; no password needed). If switching back needs a sign-in, stop and say so in the report: the orchestrating session relays a Quick Connect code (print `QUICK CONNECT CODE: <code>` on its own line).
- Run every flow inside `flock /tmp/caravela-device.lock -c '…'`. The screensaver may swallow the first key presses (HANDOFF).
- Shots: Home with a focused card and its backdrop; a movie's Details page; the player paused with the overlay (let a film play a few seconds first); the sign-in screen (Quick Connect code or the user picker on the demo server).
- **Privacy check on every image before it goes in the repo:** no address of the user's server (docs/LOCAL.md), no user avatar other than the demo's, and nothing from the user's library. The demo server's address is public and fine.
- Downscale to 1280 px wide (the TV captures at 4K), save as optimised PNG or JPEG in `docs/screenshots/readme/`, ideally under 300 KB each.
- Don't delete or edit the older files in `docs/screenshots/`.

## Checks
- Preview the rendered Markdown: check the image paths resolve and the HTML renders, for example with `npx --yes markdown-it README.md > <scratchpad>/readme.html` or a quick look at the raw file. Links to `LICENSE`, `LICENSE-EXCEPTION.md` and the section anchors still work.
- `git grep` for the hostname in docs/LOCAL.md finds nothing.

## Rules
- Files: README.md and the new screenshots in `docs/screenshots/readme/`. Nothing else in the repo (no code changes).
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the README structure
- the screenshots (paths, sizes) and the privacy check you did
- whether the TV is back on the user's account
- anything unresolved
