# Task 7b: movie details UI components (header + action buttons)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-07b (branch `task/07b-details-ui`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app's details page.** A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; port the look, don't copy code). Useful files under `app/src/main/`:
- `java/org/jellyfin/androidtv/ui/presentation/MyDetailsOverviewRowPresenter.kt`, `ui/DetailRowView.kt` and its layout `res/layout/view_row_details.xml` (poster left; title, info row, genres, overview, three label/value pairs; button row)
- `java/org/jellyfin/androidtv/ui/browsing/composable/inforow/` (`BaseItemInfoRow.kt`, `InfoRowItem.kt`, `InfoRowColors.kt`, `rating.kt`): star for community rating, tomato for critic rating, boxed badges
- `java/org/jellyfin/androidtv/ui/TextUnderButton.java` + `res/drawable/ic_resume.xml`, `ic_play.xml`, `ic_watch.xml`, `ic_heart.xml` (icon button with the label underneath; port the vector paths to SVG)

**Another agent runs at the same time:**
- 7a (details data) in `../caravela-wt/task-07a` adds `src/api/details.ts` and `src/api/itemInfo.ts`. **Don't touch those.** It produces the data your props take.
- The prop types are already on `main` in `src/components/types.ts`: `InfoRowEntry`, `DetailsInfoItem`, `DetailsAction`, `DetailsActionIcon`. **Don't change that file**; if a type doesn't fit, say so in the report.
- 7c (later) builds `src/screens/DetailsScreen.tsx` with your components over a full-screen `Backdrop`, with Cast & crew and More like this `ContentRow`s below.

## Setup
- Run `npm install` first. The worktree has no `node_modules`.
- SVG: use `@amazon-devices/react-native-svg` like `src/components/Toolbar.tsx` (settings gear).

## Scope (only this)
1. **`src/components/DetailsHeader.tsx`** (new): presentational, memoized, no data fetching.
   - Props: `title`, `posterUri?`, `placeholderColor?`, `infoRow: InfoRowEntry[]`, `genres?: string[]` (joined " / "), `overview?`, `infoItems: DetailsInfoItem[]` (up to 3), `testID?`.
   - Layout: poster on the left (2:3, placeholder colour when no image); right column: title (`typography.title`), info row (render each `InfoRowEntry` kind: star + one decimal, tomato/percentage with fresh ≥ 60 vs rotten, boxed badge, plain text), genres, overview clamped to a few lines, then the label/value pairs side by side. Transparent background: it sits over the blurred Backdrop. Use theme tokens and `px()`; text must stay readable over a bright backdrop.
2. **`src/components/DetailsActions.tsx`** (new): the button row.
   - Props: `actions: DetailsAction[]`, `hasTVPreferredFocus?` (goes to the first action), `testID?`.
   - Each button: round icon (SVG for `resume`, `play`, `watched`, `favorite`) with the label underneath, androidtv TextUnderButton style. Focus ring per `focus` tokens (scale + cyan border like `FocusableButton`); `active` shows the toggle as on (filled heart / ticked eye, violet like `FocusableButton`'s `active` outline); `disabled` dims and ignores presses but stays focusable (same reasoning as `FocusableButton`). `testID` per button: `${testID}-${action.key}`.
   - Left/right moves between buttons; Down should leave the row (7c places rows below).
3. Optional, only if it keeps things simple: a small `src/components/detailsIcons.tsx` for the SVG paths. Otherwise keep them inside `DetailsActions.tsx`.

## Tests
- `test/components/DetailsHeader.spec.tsx`: renders title, every info row kind, genres joined, overview, info items; no poster → placeholder; empty info row / no overview renders without gaps or crashes.
- `test/components/DetailsActions.spec.tsx`: renders labels in order, press calls `onPress`, disabled ignores press, preferred focus on the first button only, `active` changes the rendered state (testable via a testID or accessibility state).
- Follow the existing component test patterns (`test/components/`).

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No simulator check: nothing renders these yet. 7c checks them on the Vega simulator.

## Rules
- Source files: `src/components/DetailsHeader.tsx`, `src/components/DetailsActions.tsx` (+ optional `detailsIcons.tsx`). Tests as listed. Nothing else.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed and the component props 7c will use
- what you took from androidtv (and anything deliberately different)
- the test count and lint result
- edge cases and suggested tests
- anything unresolved
