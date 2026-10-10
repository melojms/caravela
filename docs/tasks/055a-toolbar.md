# Task 5.5a: the top Toolbar component

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-055a (branch `task/055a-toolbar`, from `main`).
Background: read docs/HANDOFF.md (section "Next: task 5.5" has the approved decisions). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Look and feel: match the official jellyfin-androidtv app.** Port the layout and styling from the clone at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only; port, don't copy). Under `app/src/main/java/org/jellyfin/androidtv/ui/`:
- `shared/toolbar/MainToolbar.kt` (what goes where), `shared/toolbar/Toolbar.kt` (layout, height, padding, the `ToolbarButtons` group, `ToolbarClock`)
- `base/button/Button.kt`, `IconButton.kt`, `ButtonColors.kt`, `ButtonBase.kt` (shape, padding, focused / active colours)
- the drawable `res/drawable/ic_settings.xml` (the settings icon shape)
Convert dp sizes to our 1080p canvas the same way `src/theme` already does, and use our theme colours where androidtv uses its theme tokens.

This is the first of three sequential subtasks. **Don't touch navigation** (`src/navigation/*`) or the screens: 5.5b mounts the toolbar and 5.5c wires focus.

## Setup
- `npm ci` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/components/Toolbar.tsx`** (new): a presentational top bar, transparent background, full width.
   - Props (keep it navigation-agnostic): `active: 'home' | 'search' | undefined`, `user: {name: string; imageUri?: string}`, `onUserPress`, `onHomePress`, `onSearchPress`, `onSettingsPress`, optional `onFocusChange?(focused: boolean)` (5.5c uses it for the Up/Down focus rules), `testID`.
   - **Left:** a round avatar button (`imageUri` from `getUserImageUrl` in `src/auth/authService.ts` is passed in by the caller; with no image or on load error show the user's initials, like the picker does). Accessible label "Switch user".
   - **Centre:** "Home" and "Search" text buttons. The active one uses `FocusableButton`'s `active` style (violet outline, 3d-2). Bold text like androidtv.
   - **Right:** a Settings icon button (port the `ic_settings` shape as an inline SVG if `react-native-svg` is already a dependency; otherwise check what Vega supports for vector icons via the Amazon Devices MCP `search_documentation`, `target_platform` `["vega_os"]`, and pick the simplest; say what you chose), then the clock.
   - Reuse `FocusableButton` where it fits. If its shape doesn't fit the round avatar / icon buttons, add the minimum needed in Toolbar.tsx rather than changing FocusableButton.
2. **`src/components/ToolbarClock.tsx`** (new): `HH:mm`, updated on the minute boundary (not every second; schedule the next tick at the next whole minute). **12/24 h:** follow the device setting if Vega exposes it (check the docs, e.g. a locale/settings API); otherwise 24 h. Not focusable.

## Tests
- `test/Toolbar.spec.tsx`: renders the three groups; each button calls its handler; `active` highlights the right button (`accessibilityState.selected`); initials when there's no image and after an image error; `onFocusChange` fires on focus in and out.
- `test/ToolbarClock.spec.tsx` (fake timers): shows the time, ticks at the next minute boundary, handles midnight, cleans up its timer on unmount; 12 h vs 24 h if the device setting is used.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- No TV check: nothing renders the toolbar yet (5.5b does). Optionally render it in a test screenshot if trivial; not required.

## Rules
- Source files: `Toolbar.tsx`, `ToolbarClock.tsx`. Tests as listed. No new npm dependency unless unavoidable; if you need one, stop and ask in your pane first.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the files changed, what you ported from androidtv (sizes, colours) and what differs
- how the icon is drawn and how 12/24 h is decided
- the test count and lint/build result
- edge cases and suggested tests, anything unresolved
