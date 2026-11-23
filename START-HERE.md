# NexusCampus — how to begin

1. Tools are the same as NOVA (`AGENTS.md` §5a): fnm + Node 24, pnpm, uv, Docker Desktop.
2. **Claude Code:** open this folder. It reads `CLAUDE.md` automatically (which points to `AGENTS.md`).
3. **Antigravity:** open the same folder and add a workspace rule:
   "Follow `GEMINI.md` and `AGENTS.md` in the repo root." (Skip if your version reads them automatically.)
4. **Codex:** reads `AGENTS.md` automatically; say "Follow `CODEX.md`." in the first message. If Gemini builds at the
   same time, give Codex its own folder: `git worktree add ../NexusCampus-AI-codex main`, then `pnpm install` in
   `frontend` and copy `backend/.env` there (never commit it) (`AGENTS.md` §3.8, D67).
5. Daily loop (D57, D68):
   - Gemini or Codex: "Start the next task." → builds the next `planned` task, sets it `ready-for-review`.
   - Claude: "Review ready tasks, then plan." → reviews and merges, keeps 2 tasks planned ahead.
   - Claude unavailable: tell Codex "Claude is away, take the lead." → Codex reviews, merges and plans (`CODEX.md`);
     say "Claude is back" when Claude returns. Gemini only ever builds.
6. At the end of each stage step (prototype, build) you review the demo build and approve the freeze.

You can delete this file after setup.
