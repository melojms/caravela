# Brief template

Briefs live at `docs/tasks/<id>-<name>.md` inside the task's worktree and are committed with the task. The agent that reads one has none of this session's context, so a brief must stand alone: say what was decided and why, name every file it may touch, and say exactly what "done" looks like. Good examples to imitate: `docs/tasks/r6a-media-controls.md`, `docs/tasks/r1b-audio-focus.md`.

Never put the server address, a password or an API key in a brief (the repo is public). Write "the server address in docs/LOCAL.md".

```markdown
# Task <ID>: <what it does, in one line>

Worktree: /home/melojms/projects/melojms-git/caravela-wt/task-<id> (branch `task/<id>-<name>`).
The user has **already approved** this. Don't ask again for approval of the overall approach.

Part of "Plan to v1.0" in `docs/PUBLISHING.md` (<R-number>). <If another agent runs in parallel: which task, its worktree, and the files it owns: "Don't edit those.">
<If no device check in this task, say so and who does it.>

## Why
<The problem, what was observed (on the Fire TV, in a probe, in the code), and what the reference app (jellyfin-androidtv) does if relevant. Include findings the agent would otherwise have to rediscover.>

## Approach (approved)
1. **`<file>`**: <what changes, with the API names, docs to read (paths into node_modules typings, Amazon docs via the Amazon Devices MCP), and decisions the user made ("the user chose: …")>.
2. ...
3. **Tests first**, see them fail: <spec files and the cases to cover, including edge cases>.

## Scope (only this)
<≤3 source files, plus their tests and mocks.>

## Checks
- `npm ci`, then `scripts/setup-shaka.sh /home/melojms/projects/melojms-git/caravela-wt/shaka-build/shaka-rel`.
- `npm run lint` (0 errors), `npx tsc --noEmit` (no new errors), full `npm test` (rerun known flaky specs alone, see Follow-ups in `docs/HANDOFF.md`), `npm run build:release`.
- <Device check if any: Fire TV for playback/captions, simulator for UI only; every device step inside `flock /tmp/caravela-device.lock -c '…'` (simulator: `/tmp/caravela-sim.lock`); sign in as `demo` with an empty password; what to look at and screenshot. Point at "How we work" in docs/HANDOFF.md for the commands.>

## Rules
- Only the files in Scope (plus this brief). One commit, no Co-Authored-By or Claude-Session trailers. Don't push, don't merge.

## Done = report back
Files changed, tests added and the count, lint/tsc/test/build results, edge cases you thought about and suggested further tests, anything odd.
```
