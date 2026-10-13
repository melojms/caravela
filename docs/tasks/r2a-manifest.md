# Task R2a: media services in the manifest

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-r2 (branch `task/r2-release-build`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (R2). Run this brief first, then `docs/tasks/r2b-versioning.md` in the same worktree.

## Why
Amazon's "General requirements for media apps" (Vega 0.24, https://developer.amazon.com/docs/vega/0.24/media-player-requirements.html) lists the `[wants]` a media app needs. Ours misses two of them, and Vega logs `missing wants declaration for service 'com.amazon.audio.system'` on every play.

## Scope (only this)
`manifest.toml`, `[wants]`:
- Add `com.amazon.media.playersession.service` next to the other W3C media services.
- Add `com.amazon.audio.system` next to `com.amazon.audio.stream` / `com.amazon.audio.control`.
Keep the existing comment style. Nothing else changes.

## Setup
`npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel` (`src/vendor/` is gitignored).

## Checks
- `npm run lint` (0 errors), `npm test`, `npm run build:release` (it validates the manifest; it must pass).
- **Fire TV** (rules in `docs/HANDOFF.md`, "How we work" and "Gotchas": `flock` around every device action, device log started outside the lock, `demo` with an empty password):
  1. Install the armv7 Release build, sign in, play a direct-play item (The AI Doc) and an HLS one (Another Simple Favor): both start, have sound, and Back leaves cleanly.
  2. The device log no longer has `missing wants declaration` for `com.amazon.audio.system` or `com.amazon.media.playersession.service` (grep for `missing wants`; report any other services it still names).

## Rules
- Only the file in Scope. One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
The diff, lint/test/build results, pass/fail per TV check, the `missing wants` lines before vs after if you have both, anything odd. Then go on to `docs/tasks/r2b-versioning.md`.
