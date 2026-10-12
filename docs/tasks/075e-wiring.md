# Task 7.5e: wire the new details pages, remove the placeholder, simulator check

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-075e (branch `task/075e-wiring`, from `task/075-tv-details`, which has 7.5a–7.5d merged).
Background: read docs/HANDOFF.md (especially "Vega Virtual Device (simulator)" under Gotchas and "Signing in during a check") and docs/PLAN.md first, then the 7.5 briefs (`docs/tasks/075*.md`) and `src/screens/details/`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.
**Do not use the Fire TV.** The user hasn't approved device checks for this task yet; the simulator only.

## Notes from 7.5c / 7.5d
- Pages: `MovieDetails`, `SeriesDetails` (testID `details-series`), `SeasonDetails` (`details-season`), `EpisodeDetails` (`details-episode`), `PersonDetails` (`details-person`), all `{item, navigation}`.
- 7.5c put shared helpers in `SeriesDetails.tsx` (`DetailsLoading`, `playEpisode`, `useOpenDetails`); move them into `DetailsLayout.tsx` (or a small `src/screens/details/shared.tsx`) and update the imports.
- The person page has a Favorite button (androidtv shows one), which takes focus on open.
- Lint baseline is now 42 warnings (system-library notices for the localize import in the new pages).

## Scope
1. **`src/screens/DetailsScreen.tsx`**: dispatch by `item.Type`: Movie, Video, MusicVideo, Trailer → `MovieDetails`; Series → `SeriesDetails`; Season → `SeasonDetails`; Episode → `EpisodeDetails`; Person → `PersonDetails`; anything else → a minimal page on `DetailsLayout` (header from the item, Favorite as the only action, no rows) — write it in this file or as `src/screens/details/GenericDetails.tsx`, whichever is smaller.
2. **`src/screens/details/MovieDetails.tsx`**: a cast card pushes `Details` for the person (not `DetailsPlaceholder`).
3. **`src/screens/LibraryScreen.tsx`**: every card opens `Details` (series included).
4. **`src/navigation/types.ts`**, **`src/navigation/RootNavigator.tsx`**: remove the `DetailsPlaceholder` route; delete `src/screens/DetailsPlaceholder.tsx` and its test once nothing references it (`grep -rn DetailsPlaceholder src test`).
That's more than 3 files, but besides the dispatch they're one-line changes.

## Tests
- `test/screens/DetailsScreen.spec.tsx`: each type goes to its page (mock the page components), unknown type → the generic page.
- Update `LibraryScreen` / `MovieDetails` tests for the new routes; remove placeholder tests.

## Checks
- `npm run lint` (0 errors; baseline 42 warnings), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- Known flake: `test/auth/RootNavigator.spec.tsx` › "starts at UserPicker with the expired notice" sometimes fails under load; rerun before chasing it.
- **Simulator** (UI only; playback stalls on the simulator, don't judge playback there): follow HANDOFF's simulator notes (`flock /tmp/caravela-sim.lock` around each whole flow, `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice`, input via `vega exec vda -s emulator-5554 shell inputd-cli …`, screenshots of the XWayland window with `import`, kept in your scratchpad). Add the test server (address in `docs/LOCAL.md` in the main checkout, `/home/melojms/projects/melojms-git/caravela/docs/LOCAL.md`) and sign in as **`demo` with an empty password**. Never use `melojms`'s password.
  Check and screenshot:
  1. Home → My media → Shows → a series: header (Seasons N, status), Play or Resume focused on open, rows Next up / Seasons / Cast & crew / More like this; Down through the rows and Up back to the buttons (page scrolls to the top).
  2. A season: title + series subtitle, poster, Episodes row; Play focused; Back to the series.
  3. An episode (from the season and from Home's Next up / Continue watching): wide thumbnail, "Series S1 E2" subtitle, Resume/Play, Watched, Favorite, Previous episode (absent on a first episode), Go to series; Next episodes and Guest stars rows.
  4. Go to series and Previous episode open the right pages; Back walks back.
  5. A cast card → person page: photo, born/birthplace, bio, Movies / TV series / Episodes rows, Favorite focused, Down into the rows, Back.
  6. Watched toggle on an episode and back (leave the server as it was); Play on an episode opens the Player (don't wait for playback).
  7. A movie page still looks as before.
- If something fails: find the cause, a failing test first, then the fix in the page or wiring file. Anything outside `src/screens/` → stop and report.

## Rules
- Source files: as listed above (plus small fixes in `src/screens/details/*` the checks need). Tests as listed.
- Commit to your branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.
- Never commit screenshots; they can show the server address.

## Done = report back
Finish with a short summary covering:
- the files changed
- the test count, lint/build result, and each simulator check with its screenshot path and result
- fixes made during the checks
- edge cases and suggested tests
- anything unresolved
