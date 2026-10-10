# Task 7c: movie details screen + wiring

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-07c (branch `task/07c-details-screen`, from `main`, which already has 7a and 7b merged).
Background: read docs/HANDOFF.md and docs/PLAN.md first, then the 7a/7b briefs (`docs/tasks/07a-details-data.md`, `docs/tasks/07b-details-ui.md`). Platform: Vega OS, React Native 0.83 / React 19, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0, TanStack Query v5.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Match the official jellyfin-androidtv app.** Reference clone: `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (`ui/itemdetail/FullDetailsFragment.java`: movie rows ~line 524, initial focus ~line 260).

## Already available (don't change unless a bug forces it; say so if it does)
- `src/api/details.ts`: `useItemDetails`, `useSimilarItems`, `useToggleFavorite`, `useTogglePlayed`.
- `src/api/itemInfo.ts`: `infoRowEntries`, `detailsInfoItems`, `resumePositionMs`, `resumeLabel`, `peopleToCards`.
- `src/components/DetailsHeader.tsx`, `src/components/DetailsActions.tsx`, `Backdrop`, `ContentRow`, `toCardItem`/`backdropUris` in `src/api/items.ts`.

## Notes from 7a / 7b
- `fetchItemDetails` uses `getLibraryApi().getItem` (returns every field). Favourite/watched go through `getUserDataApi` (SDK 1.0.0). The toggles return `{...mutation, toggle}`: call `toggle()`, read `isPending`.
- **Duplicate cast ids:** one person can be both Director and Writer, so `peopleToCards` can return two cards with the same `id`. `ContentRow` keys cards by `item.id`, so in `DetailsScreen` give cast cards unique ids (`${id}-${index}`) and map back to the person id on press. Don't change `ContentRow`.
- `DetailsActions` relies on default left/right/down focus movement; check it on the simulator. While a button is focused its icon turns white, so an active toggle only shows its state when unfocused; that's expected.
- Lint baseline is now 16 warnings (0 errors); HANDOFF's "12" was stale.

## Scope (only this)
1. **`src/screens/DetailsScreen.tsx`** (new), route `Details: {itemId: string; title: string}`:
   - Loads the item with `useItemDetails`. While loading: spinner with the route title. Error: message + Retry (like Home's error rows). A 401 is already handled globally.
   - **Not a movie** (`Type !== Movie`): render the current `DetailsPlaceholder` content (title, item id, "Details arrive in a later task.", Back button). Reuse the `DetailsPlaceholder` component's view if that's simple; don't delete it.
   - **Movie:**
     - Full-screen `Backdrop` with the movie's backdrop (`backdropUris`).
     - `DetailsHeader`: title, poster (`imageUrl`, poster size), `infoRowEntries`, genres, overview, `detailsInfoItems` (device 12/24 h via `uses24HourClock` from `@amazon-devices/react-native-localize`, as `ToolbarClock` does).
     - `DetailsActions`, in androidtv's order: **Resume from …** (only when `resumePositionMs` is defined), **Play** (from the start), **Watched** (active when played), **Favorite** (active when favourite). Resume/Play call `onPlay(startMs)`, a **silent no-op** until task 8 (leave a short comment). Watched/Favorite call the 7a toggles; `disabled` while their mutation is pending.
     - First action has preferred focus when the screen opens (Resume if shown, else Play).
     - Below, vertically scrollable: **Cast & crew** (`peopleToCards`, poster cards; hidden when empty) and **More like this** (`useSimilarItems` → `toCardItem` poster; hidden when empty; error → hide the row, don't block the page). Down from the buttons reaches the rows; Up from the first row returns to the buttons.
     - A similar card **pushes** another `Details` (`navigation.push`); a person card goes to `DetailsPlaceholder`. Back pops.
2. **`src/navigation/types.ts`** + **`src/navigation/RootNavigator.tsx`**: add the `Details` route; keep `DetailsPlaceholder`.
3. **`src/screens/HomeScreen.tsx`**: `openDetails` navigates to `Details` instead of `DetailsPlaceholder` (My media still opens Movies/Shows). Movies/Shows (mock data) stay on `DetailsPlaceholder`.

That's 4 source files, but types/RootNavigator/HomeScreen are one-line wiring changes; that's fine.

## Tests
- `test/screens/DetailsScreen.spec.tsx`: loading, error + Retry, non-movie → placeholder, movie renders header/actions/rows, Resume shown only with a resume point and focused first, Play focused when no resume point, toggles call the mutations and disable while pending, empty cast/similar rows hidden, similar error hides the row, similar press pushes `Details`, person press goes to `DetailsPlaceholder`.
- Update `test/screens/HomeScreen.spec.tsx` (or wherever Home navigation is tested) for the new route.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **On the Vega simulator** (the user asked for the simulator, not the Fire TV). It's shared: run every install / input / screenshot flow inside `flock /tmp/caravela-sim.lock -c '…'`, holding the lock for the whole flow.
  - Start it if needed: `vega virtual-device status`, then `vega virtual-device start`.
  - Install and launch: `vega run-app build/x86_64-release/caravela_x86_64.vpkg com.melojms.caravela.main -d VirtualDevice`. This wipes the app's storage.
  - Input works on the simulator with the vda serial `emulator-5554`: `vega exec vda -s emulator-5554 shell inputd-cli button_press KEY_DOWN` (KEY_UP, KEY_LEFT, KEY_RIGHT, KEY_ENTER, KEY_BACK), and `… inputd-cli send_text <text>` with a TextInput focused and the keyboard open (wait ~3 s first).
  - **Screenshots: use the Ubuntu host's capture of the simulator window**, not `gwsi-tool-screenshooter` (black on the simulator). The window is an XWayland window:
    `W=$(xwininfo -root -tree | grep '"vega-virtual-device" "vega-virtual-device"' | grep 'Vega Virtual Device' | awk '{print $1}'); import -window "$W" <scratchpad>/x.png`
    Look up `W` on every capture (the window can be recreated). The right ~320 px is the on-screen remote; crop it off. Keep screenshots in the scratchpad.
  - Sign in: add the server (address in docs/LOCAL.md), pick `melojms`, use **Quick Connect**. **Never ask for or use the password.** Show the user the Quick Connect code (print it in your pane) and wait for them to approve it.
  - Then check and screenshot: a movie from Continue watching (Resume shown and focused, "Ends" accounts for the resume point), a movie not started (Play focused), Watched and Favorite toggling (and back again, so the server ends as it started), Down into Cast & crew and More like this, a similar movie opening its own details and Back returning, Back to Home, and an episode card showing the placeholder.
- **Never commit a screenshot** that shows the server address or an unblurred avatar.

## Rules
- Source files: as listed above. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- what you took from androidtv (and anything deliberately different)
- the test count, lint/build result and what you checked on the simulator (with screenshot paths)
- edge cases and suggested tests
- anything unresolved
