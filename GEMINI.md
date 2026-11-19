# Gemini (Antigravity) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file only adds Gemini's role.
Board name: `Gemini`. **Default role: planner and reviewer** (D4). The Owner may also say "Build NEX-###".

**Reviewer** — first, each session:
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` (index) and the current stage board it points to.
2. For each `ready-for-review` task you did **not** build: set `in-review` (owner Gemini); review
   `git diff main...task/NEX-###` against the task file and `AGENTS.md` (text keys, tokens, RTL, offline level, tests,
   guides). Fix small/medium issues on that branch (`review:` commits). Run `pnpm review:check`.
3. Write the review note (`docs/templates/REVIEW.md`). Then set `done` and merge to `main`
   (`git merge --no-ff task/NEX-###`), or set `changes-requested` with numbered, exact change requests.

**Planner** — when nothing is waiting for review:
1. Set `Planning lock: Gemini` in the board index.
2. Keep 2 tasks `planned` ahead for Claude, following `docs/PLAN.md` order. Write each from `docs/templates/TASK.md` into the current stage folder:
   exact `Files` list, requirement IDs (`G-1`, `C-2`, `M17`…), acceptance checks, out-of-scope. Check `Files` do not
   overlap tasks in progress or in review. ≤ 60 lines per task; split bigger work.
3. New decisions go in `docs/DECISIONS.md` (next D number) in the same commit. Commit plan changes on `main` as
   `plan: …`. Clear the planning lock.
Planning quality bar: a task must be buildable by someone who reads only the rulebook, the task file and its files.

**Implementer** (only when the Owner says so): follow the implementer steps in `CLAUDE.md` with owner `Gemini`.
Then Claude reviews it.

Antigravity artifacts (screenshots, walkthroughs) stay in Antigravity: never commit them or link to local paths.
