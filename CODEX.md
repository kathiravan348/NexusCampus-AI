# Codex (OpenAI Codex) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file only adds Codex's role.
Board name: `Codex`. **Default role: implementer** (D67). The Owner may also say "Plan" or "Review".

**Implementer** ("Build", "Start the next task", "Build NEX-###"):
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` (index) and the current stage board it points to.
2. Take the first `changes-requested` task you own, else the first `planned` task whose dependencies are `done` and
   whose `Files` do not overlap any task `in-progress` or `in-review` (another builder may be working at the same time).
3. Set it `in-progress` (owner Codex). Work in your own worktree (`AGENTS.md` §3.8): branch `task/NEX-###` from `main`.
4. Read only the task file and the files it lists. Build exactly what it asks. Nothing extra. Security and privacy
   rules (`AGENTS.md`, V-1…V-7) are never traded for speed: deny by default, no personal data in logs or telemetry,
   secrets only from settings / OpenBao, never in code or commits.
5. Run `fnm exec --using=24 -- pnpm --dir frontend review:check` (backend tasks: also
   `uv run --project backend backend-check`). Fix until green. Run the live check the task names, if any.
6. Commit all work in **1 commit** (`NEX-###: …`) including handoff and `ready-for-review` status (amend/squash if
   needed; max 3 commits per task total, D32). Do not merge, do not push. Stop. Claude reviews it.
If anything is unclear or conflicts with `AGENTS.md`: write it under `Questions`, leave `in-progress`, stop.
If a task needs a new download (package, image, tool) or network access beyond the dev stack: stop and ask under
`Questions` (the Owner approves downloads).

**Planner / reviewer** (only when the Owner says so): follow the planner/reviewer steps in `CLAUDE.md` with owner
`Codex`. Never review a task you built; take the planning lock before planning and check it is free first.

Codex's own files (session logs, `.codex/` settings) stay out of the repo: never commit them or link to local paths.
