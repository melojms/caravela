# Task S4: Appstore images (screenshots, icons, Fire TV background)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-s4 (branch `task/s4-store-images`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (Phase 4, "Store assets"; "Road to submission" step 4 in `docs/HANDOFF.md`). No other agent runs in parallel. No app code changes. Device: the **Vega simulator only** (never the Fire TV).

## Why
The Developer Console needs these images for a Fire TV app. Sizes and rules, confirmed on 2026-10-20 from Amazon's [Appstore Details → Images and videos](https://developer.amazon.com/docs/app-submission/appstore-details.html#images-and-videos):

| Asset | Size | Rules |
|---|---|---|
| Small icon | 114×114 PNG | transparency allowed; scaling *down* the 512 icon is fine |
| Large icon | 512×512 PNG | `assets/image/app_icon.png` already exists, use as is |
| Fire TV app icon | 1280×720 | **no transparency**; logo and title inside the centred **882×448** safe area (badges may cover the rest) |
| Fire TV background | 1920×1080 | JPG or 24-bit PNG, **no transparency, no logos or titles**; main subject inside a **1214×830** area, ideally on the right |
| Fire TV screenshots | 1920×1080, 5 of them | JPG or 24-bit PNG, no transparency |

The file extension must match the real type (a JPEG named `.png` fails to upload). The user chose: plain navy background with the Sail on the right; no promo image; commit a script that regenerates the icons and the background.

Brand sources: `assets/brand/caravela-pill.svg` (Sail + "Caravela" wordmark, outlined, on a navy gradient `#103457` → `#0a1f38`; the 16:9 strip y 112–400 is what the launcher shows; it was exported by hand to `assets/image/app_icon.png`) and `assets/brand/caravela-icon.svg` (the Sail alone: the sail path with gradient `#c58bff` → `#7d5cf5` → `#3fc6ee` and the cyan wave). Theme colours are in `src/theme/tokens.ts`.

## Approach (approved)
1. **`scripts/store-images.sh <out-dir>`** (new, committed): builds from the repo's SVGs/PNG
   - `small-icon-114.png`: `app_icon.png` downscaled to 114×114.
   - `firetv-icon-1280x720.png`: the pill's 16:9 content (Sail + wordmark) on solid/gradient navy filling the whole 1280×720, scaled so its bounding box sits **inside the centred 882×448** safe area (check the real bounds, not the SVG's nominal box), no alpha channel.
   - `firetv-background-1920x1080.png` (or `.jpg`): the navy gradient full-bleed with the Sail (sail + wave from `caravela-icon.svg`, **no wordmark, no text**) on the right, inside the 1214×830 area; generous size but calm, it sits behind the store listing's text. No alpha.
   - Rendering: ImageMagick's `convert` is installed but uses its internal MSVG renderer (weak on gradients); `rsvg-convert`, `inkscape` and `cairosvg` are not installed. Prefer a reproducible renderer: e.g. `npx --yes @resvg/resvg-js-cli` (pin the version) or ImageMagick if its output matches. Compare your 1280×720 render with `app_icon.png` at the same scale: the gradients and wordmark must look the same. Put the wrapper SVGs the script needs either inline in the script (heredoc) or in at most one new file under `assets/brand/`. Strip alpha with `-alpha off` / `-background … -flatten`.
2. **Screenshots** (not committed): five 1920×1080 captures from Jellyfin's public **demo server** (`https://demo.jellyfin.org/stable`, user `demo`, empty password), on an **x86_64 Release** build in the simulator:
   1. Home (rows loaded, a card focused, backdrop showing);
   2. a movie's Details;
   3. Pioneer One's series Details;
   4. the player **paused with the overlay up** (the simulator stalls playback 3–6 s in, so pause right away; the README's player shot was taken this way in task 11f-4);
   5. the user picker.
   Follow Gotchas "Full-size captures" in `docs/HANDOFF.md` (`vega virtual-device start --display-res 1920,1080`, `scripts/sim-window-resize.py`, capture with ImageMagick `import`), but **save at full 1920×1080** (don't do the README's 1280×720 downscale), as 24-bit PNG or high-quality JPG with no alpha. Crop anything that isn't the app canvas; the result must be exactly 1920×1080. Look at each screenshot yourself: no window decorations, no remote, nothing of the test server, no clipped focus ring, no "Loading" spinner. Don't change anything on the demo server (public; no favourites/watched toggles). Restart the simulator without `--display-res` when done.
3. **Output:** everything into `/home/melojms/projects/melojms-git/caravela-wt/store-assets/` (outside the repo; screenshots and generated images are **not** committed). Also make a `contact-sheet.png` (`montage`) of all of them for review.
4. **Verify** with `identify -format '%f %wx%h %[channels] %m\n'` on every file: exact sizes, no alpha where banned (`srgb`, not `srgba`), format matches the extension. Include that output in your report.
5. **README.md**: one line under the build/release section saying `scripts/store-images.sh <dir>` regenerates the store icons and background.

## Scope (only this)
`scripts/store-images.sh`, at most one new SVG under `assets/brand/`, `README.md`, and this brief. No `src/` changes, no tests needed (no code under test).

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`, then `npm run build:release`.
- `npm run lint` (0 errors) for completeness.
- `bash -n scripts/store-images.sh`; run it twice into an empty dir and confirm the output is the same.
- Simulator steps inside `flock /tmp/caravela-sim.lock -c '…'` (one flow per lock, no long-running process inside it). Install with `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice` (wipes storage; add the demo server and sign in as `demo`). Input with `vega exec vda -s emulator-5554 shell inputd-cli button_press KEY_…`; typing as in "How we work". If the demo server is down (503 maintenance page), wait and retry; report if it stays down.

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
- Never commit a screenshot. Never put the test server address in anything.

## Done = report back
Files changed, the `identify` output for every asset, the path of the contact sheet, the renderer you chose and why, lint/build results, anything odd (e.g. a screen that wouldn't look right at 1080p), and suggestions.
