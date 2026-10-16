# Task R4a: third-party licences data

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r4a (branch `task/r4a-licenses`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R4 About in Settings). R4 is split in three: **R4a** (this: the licences data), R4b (About screen, running in parallel in another worktree), R4c (Licences screen, after both). This task has no UI and no device check.

## What's already on `main`
- `src/about/types.ts`: `LicenseEntry {name, version, license, text, url?}`. Use it as is; if it really needs a change, say why in the report instead of changing it (R4b/R4c build against it).
- Routes `Licenses` and `LicenseText {name, version}` in `src/navigation/types.ts` (R4c's, don't touch).

## Approach (approved)
The Licences screen (R4c) shows every third-party package **shipped in the app** with its **full licence text** (the user chose full texts in the app, so MIT/BSD notices travel with the binary).

- **Generator** `scripts/generate-licenses.mjs` (plain Node ≥ 22, no new dependencies), run with `npm run licenses`. It writes `src/about/licenses.json`: `LicenseEntry[]`, sorted by name then version, deduplicated on name + version, pretty-printed so diffs are readable.
- **Which packages:** only what ends up in the app's JS bundle, not everything in the production dependency tree (react-native's prod deps pull in metro, babel and the CLI, which don't ship).
  - Preferred: build the Release bundle's source map and collect the `node_modules/<pkg>` (and `<@scope>/<pkg>`) from its `sources`. Find out how: `npx react-native bundle … --sourcemap-output` with the Vega config, or a map that `build-vega` already leaves under `build/`. Say which you used.
  - Fallback if that doesn't work: the production tree from `package-lock.json` (`packages` entries without `dev`/`devOptional`), and say so.
  - Exclude our own package. Keep `@amazon-devices/*` packages that are bundled, with whatever licence they ship (report which ones and their licence IDs; some may be proprietary, which matters for R0-1).
  - **Shaka Player** isn't in npm (`src/vendor/` is gitignored, installed by `scripts/setup-shaka.sh`). Add it from its licence file under `src/vendor/` (look at what's there; Apache-2.0), with the version 4.16.13-r1.2 from docs/PLAN.md, url https://github.com/shaka-project/shaka-player. Fail with a clear message if the vendor folder is missing. **Don't** add Amazon's proprietary Shaka polyfills/wrapper as an entry (R0-1 is undecided); mention them in the report.
- **Text:** the package's `LICENSE*`, `LICENCE*`, `COPYING*` files (any case/extension), plus `NOTICE*` for Apache packages, joined with a blank line. If a package ships none, use a short line naming its SPDX licence and that no licence file was shipped, and list those packages in the report.
- `license` from the package's `package.json` (`license`, or the old `licenses` array joined with " OR "); `url` from `homepage` or `repository`, normalised to an https URL.
- `src/about/licenses.ts`: `export const LICENSES: readonly LicenseEntry[]` typed from the JSON (`resolveJsonModule` is on in the RN tsconfig). R4c imports this, not the JSON.
- `package.json`: the `licenses` script.
- Report the JSON's size and package count. If it's above ~1 MB, say so and propose something (don't implement it).

## Scope (only this)
`scripts/generate-licenses.mjs`, `src/about/licenses.ts`, `package.json` (script only), the generated `src/about/licenses.json`, `test/about/licenses.spec.ts` (new). Plus README.md (see Checks).

## Tests (`test/about/licenses.spec.ts`; write them first and see them fail)
- Every entry has a non-empty name, version, license and text; no duplicate name + version; sorted.
- **Drift check:** every runtime dependency in `package.json` `dependencies` that ships JS in the bundle is in `LICENSES` at the version installed per `package-lock.json` (an npm alias like `@react-native-async-storage/async-storage` → `@amazon-devices/react-native-async-storage__async-storage` counts as the real package). The failure message says to run `npm run licenses`. If some direct dependency legitimately isn't bundled (e.g. types only), keep a small explicit allowlist in the test with a comment.
- Shaka Player is present with an Apache-2.0 licence.
- If you factor pure helpers out of the generator (licence-file matching, URL normalising), you can unit test them; keep the generator as `.mjs` either way.

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored).
- `npm run licenses` twice: the second run leaves no diff.
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release` (the JSON import must bundle).
- README.md: in the build/setup steps, add when to run `npm run licenses` (after changing dependencies, before a release) and commit it on the branch.

## Report
How the package list is built (source map or lockfile), package count and JSON size, packages with no licence file, bundled `@amazon-devices/*` packages and their licences, test results, anything surprising.

## Rules
- Only the files in Scope (plus this brief and README.md). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
