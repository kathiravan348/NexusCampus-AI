# NexusCampus — how to begin

1. Tools are the same as NOVA (`AGENTS.md` §5a): fnm + Node 24, pnpm, uv, Docker Desktop.
2. **Claude Code:** open this folder. It reads `CLAUDE.md` automatically (which points to `AGENTS.md`).
3. **Antigravity:** open the same folder and add a workspace rule:
   "Follow `GEMINI.md` and `AGENTS.md` in the repo root." (Skip if your version reads them automatically.)
4. Daily loop:
   - Claude: "Start the next task." → builds the next `planned` task, sets it `ready-for-review`.
   - Antigravity: "Review ready tasks, then plan." → reviews and merges, keeps 2 tasks planned ahead.
5. Start: Claude builds NEX-001 while Antigravity plans NEX-004 and NEX-008 (no file overlap with 001–003).
6. At the end of each stage step (prototype, build) you review the demo build and approve the freeze.

You can delete this file after setup.
