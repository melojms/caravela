# Task 11f-5: send the token as `ApiKey` in URLs (trickplay 401)

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-11f3 (branch `task/11f3-overlay-scrim`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

## The bug
The 11f-4 Fire TV check found trickplay thumbnails never load: the user's Jellyfin 12.2 server answers every tile-sheet request with **401** because `src/playback/trickplay.ts:70` sends the token as `api_key=`. With curl, `ApiKey=` and the `Authorization` header both get 200; `api_key=` and no token get 401. Jellyfin's own `StreamInfo.ToUrl` uses `ApiKey`.

## Scope (only this)
Switch every URL token from `api_key` to `ApiKey`:
- `src/playback/trickplay.ts` (sheet URL, ~line 70, and its comment)
- `src/playback/resolver.ts` (~lines 51, 62, 85, 93 and comments). Keep the "already has a token" check matching both spellings, case-insensitive, so a server URL that has `ApiKey` doesn't get a second one.
- `src/auth/authService.ts` (~line 64, avatar URL)
With their tests (`test/playback/trickplay.spec.ts`, `test/playback/resolver.spec.ts`, `test/auth/authService.spec.ts`, and any other spec that asserts `api_key`; `grep -rn api_key src test`).

Bug-first: update/add the tests to expect `ApiKey` and see them fail, then fix.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, full `npm test` (rerun known flaky specs alone), `npm run build:release`.
- **Fire TV** (same rules as 11f-4: `flock`, `demo` with empty password, device log outside the lock): install the new armv7 build, then
  1. **Trickplay**: Spider-Man: Brand New Day, scrub at a few positions and near the end (the last, shorter sheet): the thumbnail shows and matches the frame; no 401 for `/Trickplay/` in the device log.
  2. **Direct play** starts (The AI Doc) and **HLS** starts (Another Simple Favor); a subtitle or audio switch in HLS still works.
  3. **User picker avatars** still show (sign out to the picker or use Switch user; an avatar needs a user with an image, if `demo` has none say so).
- Use curl to confirm the exact URLs the app now builds get 200 (redact the token in the report).

## Rules
- Only the files in Scope. Commit with no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added/changed and the count, lint/build result, pass/fail per TV check with screenshot paths, anything odd.
