# Task 5a: Jellyfin items → cards, and the backdrop component

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-05a (branch `task/05a-items`, from `main`).
Background: read docs/HANDOFF.md and docs/PLAN.md first. Platform: Vega OS, React Native 0.83, Vega SDK 0.24, `@jellyfin/sdk` 1.0.0.
The user has **already approved** this approach. Don't ask again for approval of the overall approach.

**Look and feel: match the official jellyfin-androidtv app.** When in doubt, read how it's done there. A clone is at `/home/melojms/projects/melojms-git/caravela-wt/ref/jellyfin-androidtv` (read-only reference; don't copy code verbatim, port the logic). Useful files under `app/src/main/java/org/jellyfin/androidtv/`:
- `ui/presentation/CardPresenter.kt` (`getDisplayConfig`: which image and aspect ratio a card uses)
- `ui/itemhandling/BaseItemDtoBaseRowItem.kt` (card title / subtitle text, image choice)
- `util/ImageHelper.kt` (image URLs, aspect ratios, max heights)
- `data/service/BackgroundService.kt` and `ui/background/AppBackground.kt` (the backdrop behind Home: item + parent backdrops, blurred by default, dimmed)

**Another agent runs at the same time:**
- 5b (Home queries) in `../caravela-wt/task-05b` edits `package.json`, `package-lock.json`, `src/App.tsx` and adds `src/api/home.ts`. **Don't touch those.**

## Setup
- Run `npm install` first. The worktree has no `node_modules`.

## Scope (only this)
1. **`src/api/items.ts`** (new, pure functions, no React):
   - `toCardItem(item: BaseItemDto, api: Api, options: {variant: CardVariant; preferParentThumb?: boolean}): CardItem`.
     - **Title and subtitle**, following androidtv (`BaseItemDtoBaseRowItem`): an episode shows the series name, then `S1:E2 · <episode name>` (handle missing season/episode numbers); a movie shows its production year; a series shows its year range (`2010 – 2015`, or `2019 – Present` when continuing); a library (`CollectionFolder`/`UserView`) shows just its name.
     - **Progress and watched:** `progress = UserData.PlayedPercentage / 100` (only when 0 < p < 100); `played = UserData.Played`.
     - **Images:** build URLs with the SDK's image URL helper if 1.0.0 has one (check `@jellyfin/sdk` exports; otherwise build `/Items/{id}/Images/{type}?tag=…&maxHeight=…&quality=96` yourself). Always include the image tag. Pick `maxHeight`/`maxWidth` from the card size in `src/theme` (scaled for the 1080p canvas; don't fetch 4K images).
       - **Landscape** (`preferParentThumb`, used by Continue Watching / Next Up): Thumb, then the parent/series thumb (`ParentThumbItemId` + `ParentThumbImageTag`, or `SeriesThumbImageTag`), then a backdrop, then Primary. Match androidtv's order where it differs.
       - **Poster:** Primary; for an episode, the series primary if the episode has none.
       - **Library (My Media):** the view's Primary (16:9).
     - No image → leave `imageUri` undefined (the card shows its placeholder colour). Give a stable `placeholderColor` from the item ID.
     - `backdropUris`: the item's backdrops plus the parent's (`ParentBackdropItemId` + `ParentBackdropImageTags`), as androidtv's `BackgroundService` does; empty when none.
   - Export the image helpers you need so 5c can reuse them.
2. **`src/components/types.ts`**: add `backdropUris?: string[]` to `CardItem`. Nothing else.
3. **`src/components/Backdrop.tsx`** (new): a full-screen background image that sits behind Home's content.
   - Props: `uri?: string`. Shows the image cover-fit, **blurred** (androidtv's default is backdrop-with-blur, 10 dp) and **dimmed** with a dark overlay so white text on top stays readable. No `uri` → only the app background colour.
   - Cross-fade between images (short, ~300 ms). Debounce isn't needed here; 5c will only change `uri` after focus settles.
   - Check the Vega docs (Amazon Devices MCP, `search_documentation`, `target_platform` `["vega_os"]`) that `Image` `blurRadius` and `Animated` opacity work on Vega before relying on them. If blur isn't supported, use a stronger dim and say so in your report.
   - Keep it cheap: one or two `Image`s max, `pointerEvents="none"`, not focusable.

## Tests
- `test/api/items.spec.ts`: titles/subtitles for movie, series (continuing and ended), episode (with and without numbers), library; progress at 0, 50, 100 and missing; played; each image fallback step for landscape and poster; no image at all; `backdropUris` with item, parent and none.
- `test/Backdrop.spec.tsx`: renders nothing but the background without `uri`; renders the image with `uri`; isn't focusable.

## Checks
- `npm run lint` (0 errors), `npx tsc --noEmit`, `npm test`.
- No TV check for this subtask (nothing on screen uses it yet). A Release build is enough: `npm run build:release`.

## Rules
- Source files: `src/api/items.ts`, `src/components/types.ts`, `src/components/Backdrop.tsx`. Tests as listed.
- Commit to the branch with no Co-Authored-By or Claude-Session trailers. Don't push, don't open a PR, don't merge.

## Done = report back
Finish with a short summary covering:
- the files changed
- what you took from androidtv (and anything you deliberately did differently)
- whether blur works on Vega
- the test count and lint/build result
- edge cases and suggested tests
- anything unresolved
