# Task 11f-3: overlay scrims as a real gradient, chapter-order test

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11f3 (branch `task/11f3-overlay-scrim`, from `main`).
Background: read docs/HANDOFF.md (Status: task 11, Follow-ups "Task 11, look" and "Task 11 tests") first, then `docs/tasks/11c-overlay-ui.md`. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

Other subtasks run in parallel: 11f-1 (`PlayerController.ts`) and 11f-2 (`PlayerScreen.tsx`). Stay inside your file scope.

## The problem
The overlay's top and bottom scrims (`Fade` in `src/components/PlayerOverlay.tsx`) are stacked `View` bands of growing opacity (`SCRIM_BANDS`, `BAND_HEIGHT`). On the Fire TV they show faint horizontal stripes. (The dimmed look over HDR in screenshots is not a problem on the TV itself; leave it.)

## Scope (only this)
**`src/components/PlayerOverlay.tsx`** with `test/components/PlayerOverlay.spec.tsx`; `src/playback/chapters.ts` only if the test below shows a bug, with `test/playback/chapters.spec.ts`.

1. Replace the bands with an SVG gradient from `@amazon-devices/react-native-svg` (already a dependency, used in `playerIcons.tsx`; its `README.kepler.md` lists `LinearGradient` inside `<Defs>`/`<Svg>` as supported on all platforms): an `Svg` filling the fade area with a `Rect` filled by a vertical `LinearGradient`. Keep the same look: the same fade height (`FADE_HEIGHT`), transparent → `SCRIM_SOLID` (0.7) black, following the old curve closely (use several `Stop`s from `SCRIM_BANDS` if a two-stop gradient looks different), reversed for the top scrim. Full width, no gaps or seams where the gradient meets the solid part. Remove `SCRIM_BANDS`/`BAND_HEIGHT`/`styles.band` if unused. Keep `pointerEvents` so the scrim never takes focus or touches.
2. Check the Jest mock for the SVG library handles `Defs`/`LinearGradient`/`Stop`/`Rect` (look in `test/__mocks__` and `jest.config.json`); extend the mock if needed and say so.
3. **Chapters out of order** (a HANDOFF test gap): a test that `currentChapterIndex` and the chapter row's start chapter behave with chapters not sorted by start time (decide whether `chapters.ts` should sort them; androidtv's `ChapterInfo` order is the server's; say what you chose).

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test` (the known flaky specs in HANDOFF Follow-ups may fail under load; rerun them alone).
- **Simulator** look check (see HANDOFF Gotchas "Vega Virtual Device"; run each flow inside `flock /tmp/caravela-sim.lock -c '…'`, sign in as `demo` on `demo.jellyfin.org/stable` with an empty password): `npm run build:release`, install, play Pioneer One, bring up the overlay paused, screenshot it to the scratchpad and look at the top and bottom scrims. Don't use the Fire TV (the orchestrating session checks it after merging).

## Rules
- Only the files listed in Scope. If something outside them is broken, say so in the report instead of changing it.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
A short summary: files changed, how the gradient is built (stops), mock changes, the chapter-order decision, test count and lint result, the screenshot path, edge cases, anything unresolved.
