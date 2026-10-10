# Task: Caravela's app pill on the Fire TV home screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-app-pill (branch `task/app-pill`, from `main`).
Background: read docs/HANDOFF.md first. Platform: Vega OS, Vega SDK 0.24.

## The ask (from the user)
Review how Caravela appears on the Fire TV **home screen** (the launcher's app "pill"). It should look as polished as the pills of other apps: **icon on the left, app name on the right**. Use the other apps' pills on the TV as the reference.

Right now `manifest.toml` has `title = "Caravela"` and `icon = "@image/app_icon.png"` (512×512 RGBA, made from `assets/brand/caravela-icon.svg`, concept B "Sail"). Nothing else is set for the launcher.

## Phase 1: investigate (no code changes)
1. **Docs first.** Use the Amazon Devices MCP (`search_documentation` / `list_documents` with `target_platform: {"device_os": ["vega_os"]}`, then `read_document`) to find what the Vega launcher uses for an app's tile or pill: the manifest keys (icon, title, any banner / tile / background-colour / "pill" assets), the required sizes, formats, safe areas, transparency rules, and any Appstore image requirements that the launcher uses. Also read `vega_cli_commands_reference.md` before any new Vega CLI command.
2. **Look at the TV.** Inside `flock /tmp/caravela-device.lock -c '…'` for each whole flow (another agent, 5b, also uses the TV):
   - Go to the Fire TV home screen (`inputd-cli button_press KEY_HOME`) and find the apps row. Take screenshots showing Caravela's pill next to other apps' pills, both **unfocused and focused**. Downscale to 960 px wide.
   - Note what the good pills do: icon shape and size, padding, background colour, how the name is shown, how focus looks.
   - **Leave the TV on Caravela when you're done** (`vega device launch-app -d 192.168.50.124:5555 -a com.melojms.caravela.main`), so the other agent isn't confused.
3. **Compare and diagnose:** why Caravela's pill looks worse (e.g. the icon has a transparent or busy background, wrong padding, the launcher falls back to something, a missing manifest key).

## Phase 2: propose, then wait
- In your pane, **describe the fix and wait for the user's approval** before changing anything: which manifest keys, which new or regenerated assets (sizes, background, padding), how you'll generate them from `assets/brand/caravela-icon.svg` (keep the Sail concept; Jellyfin's logo and wordmark must not be used).
- End with a short list of unresolved questions, if any.

## Phase 3: after approval
- Make the change. Keep the existing `[[needs.module]]` entries in `manifest.toml`.
- `npm run lint`, `npm test`, `npm run build:release`, install with `vega run-app …` (inside the lock; this wipes the app's storage, which is fine), then screenshot the home screen again, unfocused and focused.
- Save the before/after screenshots as `docs/screenshots/app-pill-before.png` and `docs/screenshots/app-pill-after.png` (960 px wide). Only commit screenshots that show no personal content.
- Commit with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- what the launcher uses (keys, sizes) and the source docs
- the cause
- the files changed
- the lint/test/build/install result and the screenshot paths
- anything unresolved
