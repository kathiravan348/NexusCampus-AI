# Claude (Claude Code) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file only adds Claude's role.
Board name: `Claude`. **Default role: planner and reviewer** (D57). The Owner may also say "Build NEX-###".

**Reviewer** — first, each session:
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` (index) and the current stage board it points to.
2. For each `ready-for-review` task you did **not** build, review it if assigned to you or if no reviewer is assigned
   (D68). Set `in-review` (owner Claude); review
   `git diff main...task/NEX-###` against the task file and `AGENTS.md` (security and privacy first: V-1…V-7,
   deny-by-default permissions, no personal data in logs or telemetry; then text keys, tokens, offline level, tests,
   guides). Run the checks yourself: `fnm exec --using=24 -- pnpm --dir frontend review:check` and, for backend work,
   `uv run --project backend backend-check`. Prove behaviour live where the task touches OpenBao, Keycloak, Lago or a
   database. Fix small/medium issues on that branch.
3. Combine any fixes, the review note (`docs/templates/REVIEW.md`) and `done` status in the task file + board into
   **1 `review:` commit**, then merge to `main` (`git merge --no-ff task/NEX-###`) — max 3 commits per task (D32).
   Or set `changes-requested` with numbered, exact change requests.

**Planner** — when nothing is waiting for review:
1. Set `Planning lock: Claude` in the board index.
2. Keep **2 tasks `planned` ahead** for the builders, Gemini (Antigravity) and Codex (D67), following `docs/PLAN.md` and the stage board. Write each
   from `docs/templates/TASK.md` into the current stage folder: exact `Files` list, requirement IDs, acceptance checks,
   out-of-scope, and the commands that prove it. Check `Files` do not overlap tasks in progress or in review.
   ≤ 60 lines per task; split bigger work. A task must be buildable by someone who reads only the rulebook, the task
   file and its files.
3. New decisions go in `docs/DECISIONS.md` (next D number) in the same commit. Commit plan changes on `main` as
   `plan: …`. Clear the planning lock. Push only when the Owner says so.

**Implementer** (only when the Owner says so): follow the implementer steps in `GEMINI.md` with owner `Claude`.
Then Gemini or Codex (the one the Owner names) reviews it.
