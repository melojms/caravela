# Task 1: Finish the Caravela scaffold

Repo: /home/melojms/projects/melojms-git/caravela (git, branch `main`; the template is already committed).
Background: docs/PLAN.md. Platform: Vega OS, React Native 0.83, Vega SDK 0.24. Fire TV device: `192.168.50.124:5555` (shown by `vega device list`).
The user has **already approved** this task's approach. Don't re-ask for approval of the overall approach; still confirm Vega CLI commands as the Amazon Devices MCP docs require.

## Scope (only this)
1. Create branch `task/01-scaffold` with `git switch -c`.
2. Add a `LICENSE` with the GPL-2.0 full text. Add a README:
   - name **Caravela**
   - "Unofficial client that works with Jellyfin servers; not affiliated with the Jellyfin project"
   - build/run steps
3. Add `.adbt-config.json`: `{"platform":{"default":"vega_os"}}`.
4. Update `manifest.toml`:
   - title "Caravela"
   - the network/internet privileges needed to call an HTTPS Jellyfin server
   - the media playback services and accessibility privilege from the MCP doc `react_native_for_vega_media_player.md` (W3C media section)
   - Validate against the `amazon-devices-vega-app-manifest` skill / `vega_app_manifest.md`.
5. Replace the template UI in `src/App.tsx` with a minimal "Caravela" splash (dark navy background, icon, name). Remove unused template assets, components and tests; keep one passing App test.
6. Icon:
   - Concept B ("Sail") is the `icon-b` symbol in docs/icon-concepts.html. Extract it into `assets/brand/caravela-icon.svg`, making the gradients self-contained.
   - Find the required icon/banner sizes and manifest keys in the Vega docs (search_documentation, target_platform vega_os).
   - Export PNGs with rsvg-convert, inkscape or a similar tool; check what's installed first.
   - Wire the PNGs into the manifest/package as the docs require.
7. Run `npm install`, `npm run lint`, `npm test`, then a Debug build. Install and launch on the Fire TV. Read `vega_cli_commands_reference.md` before running any vega CLI command.
8. Take a screenshot of the launched app on the device (see `vega_cli_commands_exec_vda_gwsi_tool_screenshooter.md`) and save it to `docs/screenshots/01-splash.png`.
9. Commit to the branch. Commit rules:
   - no Co-Authored-By or Claude-Session trailers
   - do not push
   - do not open a PR

## Out of scope
No Jellyfin API, navigation or playback code; later tasks cover those.

## Done = report back
Finish with a short summary covering:
- the files changed
- the build/install result
- the screenshot path
- anything unresolved (for example manifest privileges you were unsure about)
