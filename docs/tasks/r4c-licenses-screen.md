# Task R4c: Licences screen

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r4c (branch `task/r4c-licenses-screen`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R4 About in Settings), the last of three subtasks. R4a (merged) generated the licences data; R4b (merged) added the About screen, whose **Third-party licences** button (`testID="about-licenses"`) already navigates to `Licenses`. Checks run on the **simulator** with the official Jellyfin demo server.

## What's on `main`
- `src/about/licenses.ts`: `LICENSES: readonly LicenseEntry[]` (51 entries, sorted by name; `src/about/types.ts`: `{name, version, license, text, url?}`). Import this, not the JSON.
  - Most texts are ~1 KB, but `@amazon-devices/keplerscript-turbomodule-api`'s is **~300 KB** (it includes a third-party notices file), Shaka Player's ~19 KB, `@jellyfin/sdk`'s ~17 KB.
  - Four `@amazon-devices/*` entries have the licence ID `See license in LICENSE` (Amazon's proprietary licence). Four `@react-native/*` entries have a one-line text (no licence file shipped).
- Routes in `src/navigation/types.ts`: `Licenses: undefined`, `LicenseText: {name: string; version: string}`. Not registered yet.

## Approach (approved)
The user chose full licence texts in the app (so MIT/BSD notices travel with the binary), as a list screen plus a text screen.

- `src/screens/LicensesScreen.tsx`, exporting two screens:
  - **`LicensesScreen`**: `ScreenContainer title="Third-party licences"` (no toolbar, like About), `testID="licenses-screen"`. A short line: "Caravela includes these packages. Select one to read its licence." Then a vertical list of all `LICENSES`, one focusable row each (`FocusableButton` or the closest existing focusable; full width or a fixed wide width, left-aligned): "<name> <version>" and the licence ID, muted. Show `See license in LICENSE` as "See licence text". The first row takes focus on open (`hasTVPreferredFocus`, as About does). Pressing a row opens `LicenseText` with its name and version. Down/Up must scroll the list so the focused row stays visible; check that Vega does this with a `ScrollView`/`FlatList` (Home and Search use `ScrollView`). Back from a text screen must land on the same row (check whether Vega restores it by itself, as it did for Search in R3; say what you found).
  - **`LicenseTextScreen`**: title "<name> <version>", the licence ID and the `url` if any (as text), then the full text. On a TV, text only scrolls if something focusable moves, so split the text into chunks (paragraphs on blank lines, merged up to a few hundred characters; split oversized paragraphs on line breaks) and render each chunk as a focusable item with a subtle focus hint (e.g. a thin left bar in `colors.violet`, not a big ring), in a virtualised `FlatList` so the 300 KB text doesn't render all at once. Up/Down move a chunk at a time. Make the chunking a pure exported function and unit test it. An unknown name/version (shouldn't happen) shows "Licence not found" and Back still works.
  - Text style: `typography.body` (or a smaller existing token if one exists for long text), `colors.textMuted`, monospace not needed. Keep line breaks.
  - UI text uses British "licence(s)"; code identifiers stay `license`.
- `src/navigation/RootNavigator.tsx`: register `Licenses` and `LicenseText` next to `About`.

## Scope (only this)
`src/screens/LicensesScreen.tsx`, `src/navigation/RootNavigator.tsx`, `test/screens/LicensesScreen.spec.tsx` (new). If `test/App.spec.tsx` needs a small mock update, that's a third file. Plus README.md (see Checks).

## Tests (write them first and see them fail)
Use a small fake `LICENSES` (mock `../about/licenses`) plus one test against the real data.
- The list shows every entry with name, version and licence ID ("See licence text" for Amazon's); pressing a row navigates to `LicenseText` with its name and version.
- The text screen shows the title, licence ID, url and the whole text across its chunks (joining the chunks gives the original text back, ignoring the blank-line separators); unknown entry shows "Licence not found".
- Chunking: paragraphs on blank lines, merging small ones, splitting oversized ones on line breaks, no empty chunks, line breaks preserved; the real 300 KB entry chunks without any chunk over the limit (allow a single line longer than the limit to stay whole).
- Navigator: About's licences button reaches the list (if `test/App.spec.tsx` makes this easy; otherwise skip and say so).

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored; it now also copies Shaka's LICENSE).
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- `npm run licenses` (after the release build) leaves `src/about/licenses.json` unchanged.
- **Simulator** (rules in `docs/HANDOFF.md` "Gotchas": `flock /tmp/caravela-sim.lock`, input via `-s emulator-5554`, screenshots with ImageMagick from the host). `run-app` wipes storage, so add the demo server `demo.jellyfin.org/stable` and sign in as `demo` with an empty password (signing in from Password has been sending the app to the launcher; relaunch with `vega device launch-app` without reinstalling). Don't change anything on the demo server. Wait for each screen to load before sending keys.
  1. Settings → About → Third-party licences: the list, first row focused.
  2. Down to `@jellyfin/sdk` → Enter: its MPL-2.0 text; Down a few times scrolls it. Back: the list with `@jellyfin/sdk` focused.
  3. Open `@amazon-devices/keplerscript-turbomodule-api` (the 300 KB one): it opens without a noticeable hang (note roughly how long), Down scrolls smoothly; hold/press Down ~30 times and check it keeps up. Back.
  4. Down to the last row (`whatwg-fetch`): the list scrolls with focus and nothing is cut off.
  5. Open Shaka Player: the Apache-2.0 text first.
  6. Back ×3: About, Settings.
  Screenshots of 1, 2 (text and back on the list), 3, 4 and 5, kept in the scratchpad (not the repo).
- README.md: extend the About line(s) in Status/Features to mention the third-party licences, and commit it on the branch.

## Report
What you built, focus/scroll findings (list scrolling, Back restore, chunk scrolling, the 300 KB entry's open time), test results, simulator results with screenshot paths, anything surprising.

## Rules
- Only the files in Scope (plus this brief and README.md). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.
