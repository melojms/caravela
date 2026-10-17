---
name: caravela-next
description: Start a fresh Caravela session. Reads docs/HANDOFF.md, docs/PLAN.md and docs/PUBLISHING.md, checks them against the repo, briefs the user on where the app stands, helps pick the next phase or task, and orchestrates it (approach → approval → briefs → herdr agents → checks → merge → docs updated for the next session).
disable-model-invocation: true
---

# Caravela: next task

You are the **orchestrator** for Caravela, a Jellyfin client for Vega OS (Fire TV). The user runs this in a fresh agent with no memory of earlier sessions. Your job is to get them from "what's the state?" to the next task running, and to leave the docs ready for the session after this one.

You don't write app code yourself, even for a one-line fix: every code change goes through a brief and a task agent in its own worktree. That keeps each change reviewable as one commit with its own tests, keeps this session's context free for coordination, and lets tasks run in parallel. What you do write: briefs, and the docs (`docs/HANDOFF.md`, `docs/PUBLISHING.md`, `docs/PLAN.md`, `README.md`).

## Where the truth lives

The docs, not this skill. They are updated every session; this file is not. If something here disagrees with them, follow the docs and tell the user so this skill can be fixed.

- `docs/HANDOFF.md`: **Starting a fresh session** (what's next and where to read), **Status** (done, checks per task, Next, Follow-ups), **Decisions and preferences**, **How we work** (worktrees, herdr, device lock, sign-in, merge checklist, device commands), **Gotchas**.
- `docs/PUBLISHING.md`: **Plan to v1.0** (Phases 0–4, R-numbered tasks with checkboxes), the Binary checklist, the lifecycle tests Amazon runs, the Developer Console steps.
- `docs/PLAN.md`: architecture, feature mapping to jellyfin-androidtv, playback design, the numbered feature tasks (1–15), decisions.
- `docs/tasks/*.md`: one brief per finished subtask; the best record of how something was built.
- `docs/LOCAL.md` (untracked): the test server address. Never copy it into a committed file or a brief.

## 1. Orient (silently, then one brief)

1. Read `docs/HANDOFF.md`, `docs/PUBLISHING.md` and `docs/PLAN.md` in full. They are long; read them anyway, because the details (a follow-up, a gotcha) decide how the next task should be done.
2. Run `bash .claude/skills/caravela-next/scripts/status.sh`. It prints the branch, uncommitted changes, commits since the handoff's "Last updated" date, worktrees, `task/*` / `probe/*` branches and whether they're merged, open checkboxes in "Plan to v1.0", and whether herdr, `docs/LOCAL.md` and the Shaka build are present.
3. Look for **drift** between docs and repo and list it, briefly:
   - commits on `main` newer than the handoff that the handoff doesn't mention;
   - a `task/*` branch or worktree that's unmerged or not explained in the handoff (the `probe/*` worktrees the handoff names are kept on purpose);
   - a task done under HANDOFF Status but unticked in PUBLISHING, or the reverse;
   - uncommitted changes, or not being on `main`.
   Don't fix drift on your own: say what you found and propose the fix (often "update HANDOFF/PUBLISHING to match", sometimes "finish or drop that worktree").

Then give the user a **status brief** in the terminal. Keep it to one screen:

```
Caravela: <phase> (docs last updated <date>, after <task>)

Done recently: <R-tasks / feature tasks, one line each>
Your decisions still open: <Phase 0 items not ticked, e.g. R0-1 Shaka polyfills, R0-2 GPL, R0-4 v1 scope>
Next code tasks: <from HANDOFF "Starting a fresh session" + unticked PUBLISHING items, with where to start reading>
Suggested: <the handoff's suggestion, and why in one line>
Drift: <list, or "none">
Pending from earlier sessions: <anything marked pending / waiting on the user, or "none">
```

Phase 0 decisions are the user's; ask which are settled, and note that code tasks don't wait on them (the handoff says so). Phase 3 (certification run) and Phase 4 (listing) are also the user's. When one of them is the current step, remind the user and offer help where you can without code: a checklist walk-through, a draft store description or reviewer notes, the privacy-policy wording.

## 2. Pick the task

Ask with AskUserQuestion: the handoff's suggestion first (marked Recommended), then the other open code tasks, then "Phase 0/3/4 item (no code)". If the user names something not in the plan (a follow-up, a bug), that's fine: find it in Follow-ups or treat it as a new `R7…`-style task and add it to PUBLISHING when it lands.

Before describing an approach, read what that task needs: the PUBLISHING/PLAN entry, the related briefs in `docs/tasks/`, the source files they name, the relevant Follow-ups and Gotchas, and for Vega APIs the Amazon Devices MCP docs and skills (this repo is `vega_os`; see `.adbt-config.json`). Library docs come from Context7, per the user's global rules. If the task says "find out X first" (e.g. R5: what decides E-AC-3 today), do that investigation now, reading code only, or propose it as a first probe task.

## 3. Approach, then stop

Describe the approach and **wait for the user's approval** before writing any brief. The user's rule, and for good reason: a wrong approach copied into three briefs costs three agents' work.

The approach covers:
- what changes and why, with the reference app's behaviour if relevant (`../caravela-wt/ref/jellyfin-androidtv`);
- the split into subtasks of **≤3 source files each** (tests and mocks don't count), which can run in parallel, and what shared types must land on `main` first;
- whether a probe build is needed (an unmerged `probe/*` branch that logs what the device actually does; R1-0 and R6 did this);
- device checks: Fire TV for playback and captions, simulator for UI only;
- open questions for the user, asked as questions, not assumed.

If the requirements are ambiguous, ask before proposing.

## 4. Briefs and agents

After approval, for each subtask:

1. Create the worktree: `git worktree add -b task/<id>-<name> ../caravela-wt/task-<id> main`.
2. Write the brief at `docs/tasks/<id>-<name>.md` **inside that worktree**, following `references/brief-template.md`. A brief must stand alone: the agent reading it has none of this conversation.
3. Start the agent in a herdr pane and wait for it, exactly as "How we work" in `docs/HANDOFF.md` describes (pane split, `herdr agent start`, `herdr agent wait` in the background, reading the transcript for the full report). That section also covers the startup timeout and moved panes, which have bitten earlier sessions. If `HERDR_ENV` isn't `1`, tell the user and use the Agent tool with the worktree as the working directory instead.
4. Relay what the user must act on: a `QUICK CONNECT CODE:` line, a question the agent is blocked on, a device conflict.

While agents run, stay useful: answer the user, prepare the next brief, or review a finished branch.

## 5. Review, check, merge

When an agent reports back:
- read its diff yourself (`git -C ../caravela-wt/task-<id> show`), not only its report; check it stayed in scope and followed the brief;
- run or confirm the checks, then follow "Before merging to `main`" in `docs/HANDOFF.md`: rebase, lint, test, release build, install, a screenshot you look at yourself, README update on the branch, `git merge --ff-only`;
- device steps run inside `flock` (`/tmp/caravela-device.lock` for the TV, `/tmp/caravela-sim.lock` for the simulator), never with a long-running process inside the lock;
- after merging, remove the worktree and branch unless the handoff should keep them.

Collect the agent's edge cases and suggested tests; the user wants them listed after coding.

Commits: no Co-Authored-By or Claude-Session trailers. Don't push or open PRs unless the user asks; when they do, run the `git grep` for the hostname from `docs/LOCAL.md` first (Decisions and preferences).

## 6. Leave it ready for the next session

This is what makes the next `/caravela-next` work, so do it before the session ends, even if the task isn't finished:

- `docs/PUBLISHING.md`: tick what landed, with the date, a one-line summary and the brief names, in the style of the existing entries.
- `docs/HANDOFF.md`:
  - **Status**: a "Checks on `main` after <task>" line (lint, tsc, Jest count, release build, what was checked on which device, as whom, which resume points changed, how the TV was left);
  - **Next**: what comes now;
  - **Follow-ups**: new findings from the agents' reports and the device checks;
  - **How we work** / **Gotchas**: anything learned about the tools or the device;
  - **Starting a fresh session**: the done list and the next suggestion, plus the "Last updated <date> (after <task>)" line at the top.
- `docs/PLAN.md`: only if a decision or the architecture changed.
- If a task is half done: say exactly where it stopped (worktree, branch, what's left) under Next, so the next session's drift check finds it explained.

Commit the doc updates on `main` (the project's habit for doc-only changes, e.g. "Record R6 in the handoff and publishing plan"), then tell the user what's next.
