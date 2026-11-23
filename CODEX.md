# Codex (OpenAI Codex) — NexusCampus

Read `AGENTS.md` first. It is the rulebook for every agent. This file adds Codex's role and its hard rules.
Board name: `Codex`. **Default role: implementer.** **Backup lead (D68):** when the Owner says Claude is unavailable
("Claude is away", "Codex, take the lead"), Codex plans, reviews and merges exactly as `CLAUDE.md` describes, with owner
`Codex`, until the Owner says Claude is back. Without that message Codex never plans, reviews or merges on its own.

## Hard rules (always; they win over speed)
1. **One working folder:** work only in the repo folder the Owner opened (or the worktree `AGENTS.md` §3.8 names).
   Never create another project, copy of the repo, archive (`.zip`) or review folder anywhere, and never inside the repo.
2. **Scratch files** (notes, logs, test specs) go in the system temp folder, never in the repo; delete them when done.
   A live-check test you write in `frontend/e2e/real/` must be removed before you commit.
3. **Git:** branch `task/NEX-###` from `main` for a build; review on the task branch itself. Never `push` unless the
   Owner says so in this session. Never `--force`, `reset --hard`, rebase or amend a commit that is on `main` or
   pushed, delete a branch, or switch branches with uncommitted work. Commit names only: `NEX-###: …`, `review: …`,
   `plan: …`, `Merge task/NEX-###: …`, `revert: …`.
4. **Rule files** (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `docs/DECISIONS.md`, `docs/PLAN.md`) change only
   when the Owner asks for that change in this session, as one `plan:` commit that also records a decision.
5. **Shared dev stack:** leave every database, container and server as you found it: stop dev servers you started,
   delete rows you added, drop leftover `nexus_test_*` databases your test run left, never re-create containers or
   volumes. Never run anything against `NOVA` containers.
6. **Downloads and outside network:** ask the Owner first (packages, images, tools, any site other than the dev stack).
7. **Secrets:** read them only from `backend/.env` / OpenBao at run time; never print, commit or put them in a file.
8. **One task per session.** If something is unclear: write it under `Questions` in the task file and stop.

## Implementer ("Build", "Start the next task", "Build NEX-###")
1. Read `AGENTS.md`, `docs/tasks/BOARD.md` and the current stage board.
2. Take the first `changes-requested` task you own, else the first `planned` task whose dependencies are `done` and
   whose `Files` do not overlap a task `in-progress` / `in-review` (Gemini may be building at the same time).
3. Set it `in-progress` (owner Codex) on branch `task/NEX-###`. Read only the task file and the files it lists. Build
   exactly that. Security and privacy (V-1…V-7) first: deny by default, no personal data in logs or telemetry.
4. Run `fnm exec --using=24 -- pnpm --dir frontend review:check` (backend tasks also
   `uv run --project backend backend-check`) until green, and the live check the task names.
5. **1 commit** `NEX-###: …` with code, tests, guides, handoff and `ready-for-review`. Do not merge, do not push.
   Claude reviews it; Codex never reviews a task it built.

## Reviewer and merge (backup lead only, or when the Owner says "Review NEX-###")
1. Never review a task you built. Set `in-review` (owner Codex) on the board in the task branch.
2. Read `git diff main...task/NEX-###` against the task file and `AGENTS.md`; run both checks yourself; prove it live
   where the task touches OpenBao, Keycloak, Lago or a database, then reset what the proof changed.
3. Fix small/medium issues on the task branch; for bigger problems set `changes-requested` with numbered requests.
4. **1 commit** `review: …` (fixes + review note from `docs/templates/REVIEW.md` + `done` in task file and board), then
   on `main`: `git merge --no-ff task/NEX-###`. On a board conflict keep both sides' rows with their newest status.
   Run both checks on `main` after the merge; if they fail, fix on `main` with a `review:` commit or revert the merge.

## Planner (backup lead only, or when the Owner says "Plan")
Check `Planning lock` in `docs/tasks/BOARD.md` is free, set `Planning lock: Codex`, follow the planner steps in
`CLAUDE.md` (2 tasks ahead, ≤ 60 lines each, exact `Files`, no overlap), commit `plan: …` on `main`, clear the lock.

## End of every session — report and clean up
Before you stop: `git status` is clean or only shows your intended commit; no scratch files or folders left; dev
servers stopped; dev data reset. Reply with: done / commits / changed files / checks run / open questions.
Codex's own files (session logs, `.codex/` settings) stay out of the repo.
