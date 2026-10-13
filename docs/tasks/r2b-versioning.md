# Task R2b: version and build number in Release builds

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r2 (branch `task/r2-release-build`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R2). Do it after `docs/tasks/r2a-manifest.md`.

## Why
Every VPKG we've built has `"build_number": 0` (`build/*-release/vpkg-info.json`); the Appstore needs it ≥ 1, and both the version and the build number must go up with every submission ("Version Your App", https://developer.amazon.com/docs/vega/0.24/app-version.html). The built VPKGs also say version `0.1.0` while `manifest.toml` says `0.1.1`, so it's unclear where the VPKG takes its version from today. Pass both explicitly.

## Decisions (approved)
- **The version comes from `manifest.toml`** (`[package] version`, the first `version = "…"` line), which the release workflow already bumps. Don't add another source of truth.
- **The build number is derived from the version:** `major * 10000 + minor * 100 + patch` (1.0.0 → 10000, 1.2.3 → 10203). Fail with a clear message if the version isn't `X.Y.Z` with plain numbers, if minor or patch is ≥ 100, or if the result is < 1 (0.0.0).
- v1.0.0 will come from running the release workflow with `major`; don't change the version in this task.

## Scope (only this)
1. **New `scripts/build-release.sh`** (bash, `set -euo pipefail`, executable, a short header comment like `scripts/setup-shaka.sh`): reads the version as above, works out the build number, prints both, then runs `npx react-native build-vega --build-type Release --build-version "$version" --build-number "$number" "$@"`, so callers can add flags such as `--target armv7`. Run from any directory (resolve the repo root from the script's path).
2. **`package.json`:** `build:release` runs the script. Leave `build:debug` alone.
3. **`.github/workflows/release.yml`:**
   - The build step uses `npm run build:release -- --target armv7` instead of calling `react-native build-vega` directly.
   - A new step after it runs `vega exec vpt info build/armv7-release/caravela_armv7.vpkg --json`, prints it, and fails unless `version` equals the bumped version (`steps.version.outputs.next`) and `build_number` equals the derived number and is ≥ 1. Parse the JSON with `jq` (it's on the GitHub runners) or `node -e`.
   - Nothing else in the workflow changes (it still creates a draft release; see its header comment).

No Jest test for a shell script is needed; test it by running it (below).

## Checks
- `bash -n scripts/build-release.sh`, and `shellcheck` if it's installed.
- The failure cases: run the version/number logic against a temporary copy of a manifest with `1.2`, `1.100.0`, `0.0.0` and `1.0.0-beta` (e.g. a `MANIFEST` override env var only if it keeps the script simple; otherwise a throwaway copy of the script outside the repo) and show each message.
- `npm run lint`, `npm test`, `npm run build:release -- --target armv7`, then `vega exec vpt info build/armv7-release/caravela_armv7.vpkg --json`: version `0.1.1`, build number `101`.
- Check the workflow YAML parses (e.g. `npx --yes js-yaml .github/workflows/release.yml > /dev/null`, or `python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))'`). Don't run the workflow.
- **Fire TV** (same rules as R2a): install the new armv7 build **in place** with `vega device install-app` (not `run-app`, which wipes storage) over R2a's build, which had build number 0. The install succeeds, the app launches still signed in as `demo`, and something plays.

## Rules
- Only the files in Scope (plus this brief and r2a's, already in the worktree). One commit for R2b, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, the script's output, the `vpt info` JSON, the failure messages, YAML check, TV pass/fail, anything odd (e.g. whether `--build-version` now overrides what the VPKG said before).
