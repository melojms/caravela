# Task 5.5b: replace the side menu with a stack and mount the toolbar

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-055b (branch `task/055b-stack-nav`, from `main`).
Background: read docs/HANDOFF.md (section "Next: task 5.5", approved decisions) and docs/tasks/055a-toolbar.md (the `Toolbar` you'll mount, merged). Platform: Vega OS, React Native 0.83 / React 19, `@amazon-devices/react-navigation__*` 8.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Look and feel: match jellyfin-androidtv** (clone at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv`; `app/src/main/java/org/jellyfin/androidtv/ui/shared/toolbar/MainToolbar.kt` for what each toolbar button does, `ui/home/HomeFragment.kt` for the layout: toolbar above the rows).

## Today
`src/navigation/MainMenu.tsx` is a bottom-tab navigator with its bar on the left (`SideMenu.tsx`, entries in `menuEntries.ts`) holding Home / Movies / Shows / Search / Settings, mounted as the root stack's `Main` screen. `backBehavior="firstRoute"` sends Back to Home, and Back on Home exits.

## Scope (only this)
1. **`src/navigation/RootNavigator.tsx` + `src/navigation/types.ts`**: when signed in, the root stack holds `Home` (initial), `Search`, `Settings`, `Movies`, `Shows`, `DetailsPlaceholder` directly. Drop `Main`, `MenuParamList` and `MenuScreenProps` (use `RootStackScreenProps<…>` everywhere). Keep the auth group, the `Launch` screen, the `navigationKey`s and the `SessionQueryClientProvider` exactly as they are.
   - **Back:** Back from Search / Settings / Movies / Shows / Details pops to the previous screen; **Back on Home exits the app** with no confirmation (approved). Check that the native stack's default does that on Vega (it should fall through to the system when there's nothing to pop); confirm on the TV.
2. **Delete** `src/navigation/MainMenu.tsx`, `SideMenu.tsx`, `menuEntries.ts` and their tests (if any).
3. **`src/screens/ScreenContainer.tsx`**: an optional `toolbar?: 'home' | 'search'` prop. When set, render `<Toolbar>` (from 5.5a) at the top with `active` = that value, wired as androidtv's MainToolbar:
   - avatar → `switchUser()` from `useSession()` (the picker); user name and `imageUri` from the session (`getUserImageUrl` in `src/auth/authService.ts`, with the token as 3a-3 does)
   - Home → navigate to `Home` if not already there (pop to it, don't push a second Home)
   - Search → navigate to `Search` if not already there
   - Settings → navigate to `Settings`
   - The `paddingLeft` beside the side menu goes away; keep the screen padding consistent with the toolbar's edge padding (px(64)). Update the comment about the side menu.
   - Only the props needed now; focus rules (Up/Down between the toolbar and content) come in 5.5c.
4. **Type-only touch-ups** in `src/screens/HomeScreen.tsx` and `src/screens/MoviesScreen.tsx` (and any other screen using `MenuScreenProps`): switch to `RootStackScreenProps`. **Nothing else** in those screens; 5.5c owns Home's behaviour.
5. Pass `toolbar="home"` on Home and `toolbar="search"` on Search (one prop each) so the app stays navigable after this merge. Settings, Movies and Shows get no toolbar (approved), they show their own title.

Note: Movies and Shows have no entry point after this (they were in the side menu). That's expected; 5.5c makes the My media cards open them. Mention it in your report.

## Tests
- `test/App.spec.tsx` / `test/auth/RootNavigator.spec.tsx`: signed in → Home with the toolbar; the toolbar's Search / Settings / Home navigate; avatar → picker; Back from Search returns to Home. Remove side-menu assertions.
- `test/ScreenContainer.spec.tsx` (new or extend): toolbar shown only with the prop, with the right `active`.
- Keep all other tests green.

## Checks
- `npm ci` first. `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **On the TV** (hold `flock /tmp/caravela-device.lock -c '…'` for the whole flow, including while waiting): `run-app` wipes storage; add `jellyfin.example.lan` (type with `inputd-cli send_text`), pick `melojms`, start Quick Connect, **print the code and ask the user to approve it**, then wait. **Never use a password.** Note: the first launch after installing can show a black screen for a few seconds; wait or relaunch with `vega device launch-app`.
  - Check: Home shows the toolbar (avatar, Home highlighted, Search, Settings gear, clock) and no side menu; Up from the first row reaches the toolbar (if it doesn't yet, note it: 5.5c owns focus); Search and Settings open and Back returns; Back on Home exits to the Fire TV home screen; relaunch and check auto-login lands on Home.
  - Screenshot (960 px wide): `docs/screenshots/055b-home-toolbar.png`. **The avatar is the user's photo: crop or blur the avatar area before committing**, or keep that screenshot in the scratchpad and commit one without the avatar visible.
  - **Don't sign out at the end.**

## Rules
- Source files: as listed above. Commit with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the files changed/deleted, how Back behaves (and whether Back on Home exits on the TV)
- the test count, lint/build/install result, screenshot path
- edge cases and suggested tests, anything unresolved
