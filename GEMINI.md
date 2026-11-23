# Gemini (Antigravity) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file only adds Gemini's role.
Board name: `Gemini`. **Default role: implementer** (D57). The Owner may also say "Plan" or "Review".

**Implementer** ("Build", "Start the next task", "Build NEX-###"):
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` (index) and the current stage board it points to.
2. Take the first `changes-requested` task you own, else the first `planned` task whose dependencies are `done` and
   whose `Files` do not overlap any task `in-progress` or `in-review`.
3. Set it `in-progress` (owner Gemini). Create or switch to branch `task/NEX-###` from `main` (own worktree when
   Codex builds at the same time, `AGENTS.md` §3.8).
4. Read only the task file and the files it lists. Build exactly what it asks. Nothing extra. Security and privacy
   rules (`AGENTS.md`, V-1…V-7) are never traded for speed: deny by default, no personal data in logs or telemetry,
   secrets only from settings / OpenBao, never in code or commits.
5. Run `fnm exec --using=24 -- pnpm --dir frontend review:check` (backend tasks: also
   `uv run --project backend backend-check`). Fix until green. Run the live check the task names, if any.
6. Commit all work in **1 commit** (`NEX-###: …`) including handoff and `ready-for-review` status (amend/squash if
   needed; max 3 commits per task total, D32). Do not merge, do not push. Stop. Claude reviews it.
If anything is unclear or conflicts with `AGENTS.md`: write it under `Questions`, leave `in-progress`, stop.
If a task needs a new download (package, image, tool): stop and ask under `Questions` (the Owner approves downloads).

**Build only (D68):** Gemini never plans, reviews, merges, pushes or edits rule files (`AGENTS.md`, the agent files,
`docs/DECISIONS.md`, `docs/PLAN.md`). If asked to, it says so and stops. Scratch files stay outside the repo.

Antigravity artifacts (screenshots, walkthroughs) stay in Antigravity: never commit them or link to local paths.
