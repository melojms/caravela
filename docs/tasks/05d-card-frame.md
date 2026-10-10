# Task 5d: remove the coloured frame around unfocused cards

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-05d (branch `task/05d-card-frame`, from `main`).
Background: read docs/HANDOFF.md and docs/tasks/03c-polish.md (the same bug was fixed on the user tiles there). Platform: Vega OS, React Native 0.83.
The user has **already approved** fixing this. Don't ask again for approval of the overall approach.

**Look and feel: match the official jellyfin-androidtv app** (clone at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv`; cards: `app/src/main/java/org/jellyfin/androidtv/ui/composable/item/ItemCard.kt`, `ui/presentation/CardPresenter.kt`). androidtv cards have **no frame** when unfocused; focus shows a ring around the image.

## The bug
On the TV (`docs/screenshots/05c2-home.png`, `05c2-home-latest.png`), **every** card with artwork shows a thin purple/teal frame around the image, even unfocused.
**Likely cause:** in `src/components/FocusableCard.tsx` the image box has `backgroundColor: placeholderColor` and a transparent `focus.borderWidth` border (styles around lines 70 and 122), so the placeholder colour shows through the border as a frame. Confirm the cause first.

## Scope (only this)
- **Bug rule: write a reproducing test first** (`test/FocusableCard.spec.tsx`): an unfocused card **with an image** has no visible coloured frame (no placeholder colour on the element that carries the border, or an equivalent check), while a card **without** an image still shows its placeholder colour, and only the focused card gets `colors.focus`. See it fail, then fix.
- Fix in `src/components/FocusableCard.tsx` only, e.g. put the placeholder colour on an inner view inside the border, or show it only while there's no image / it's loading. Keep the layout stable (no size change on focus) and keep the focus ring and scale as they are.

## Checks
- `npm ci` first. Then `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`, `npm run build:release`.
- **On the TV** (hold `flock /tmp/caravela-device.lock -c '…'` for the whole flow, including while waiting): `run-app` wipes storage, so add `jellyfin.example.lan` (type with `inputd-cli send_text`), pick `melojms`, start Quick Connect, **print the code and ask the user to approve it**, then wait. **Never use a password.**
  - On Home, check unfocused cards have no frame and the focused card has the cyan ring. Also check the Movies grid (mock data with placeholder colours) still shows its placeholder colours.
  - Screenshot (960 px wide): `docs/screenshots/05d-home.png`. No avatar photos. **Don't sign out at the end.**

## Rules
- Source file: `FocusableCard.tsx` only. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
- the root cause, the files changed, the test count, lint/build/install result, the screenshot path, edge cases and suggested tests, anything unresolved
