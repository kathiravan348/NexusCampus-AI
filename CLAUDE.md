# Claude (Claude Code) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file only adds Claude's role.
Board name: `Claude`. **Default role: implementer** (D4). The Owner may also say "Plan" or "Review".

**Implementer** ("Build", "Start the next task", "Build NEX-###"):
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` (index) and the current stage board it points to.
2. Take the first `changes-requested` task you own, else the first `planned` task whose dependencies are `done` and
   whose `Files` do not overlap any task `in-progress` or `in-review`.
3. Set it `in-progress` (owner Claude). Create or switch to branch `task/NEX-###` from `main`.
4. Read only the task file and the files it lists. Build exactly what it asks. Nothing extra.
5. Run `fnm exec --using=24 -- pnpm --dir frontend review:check` (backend tasks: also `backend-check`). Fix until green.
6. Commit (`NEX-###: …`), write the handoff (≤ 20 lines), set `ready-for-review`. Stop. Gemini reviews it.
If anything is unclear or conflicts with `AGENTS.md`: write it under `Questions`, leave `in-progress`, stop.

**Planner / reviewer** (only when the Owner says so): follow the planner/reviewer steps in `GEMINI.md` with owner
`Claude`. Never review a task you built; take the planning lock before planning.
