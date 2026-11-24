# Stage 3 — automated run log (D73)

> One page for the Owner: how Claude drives the builders, the exact commands, which model each task used, how
> approvals are decided, and where every task stands. Claude updates it with each plan / review commit on `main`.

## Set-up
| Builder | Tool (CLI) | Folder (git worktree) | Can do |
|---|---|---|---|
| Codex | `codex` 0.171.0 (`%LOCALAPPDATA%\pnpm\bin\codex.cmd`, run via `fnm exec --using=24 --`) | `../NexusCampus-AI-codex` | edit files only (sandbox `workspace-write`, no network) |
| Gemini | `agy` 1.5.15 (`%LOCALAPPDATA%\agy\bin\agy.exe`) | `../NexusCampus-AI-gemini` | edit files only (`--mode accept-edits`) |
| Claude | this session | `NexusCampus-AI` (`main`) | plan, run checks, review, merge, push |

Orchestrator folder (outside the repo, `O` = `C:/Users/kathi/Dev/Projects/NexusCampus-AI-orchestrator`):
`start-build.sh` (starts a build as a detached hidden process), `run-builder3.sh` (the build harness), `status.sh`
(one-screen status), `check-main.sh` (full check under the shared lock), `lib.sh`, `logs/` (`<agent>.state`, build logs).
Review fixes are made in `../NexusCampus-AI-review` (a worktree for review only).

## Commands Claude gives
```
bash $O/status.sh                                                  # what is running / waiting
bash $O/start-build.sh <codex|gemini> NEX-### <model> <effort>     # start a build (detached; refuses a busy builder)
bash $O/check-main.sh                                              # full check of main under the lock → GREEN / RED

# what the harness runs inside
codex exec -c sandbox_mode="workspace-write" -m <model> -c model_reasoning_effort="<effort>" -C <worktree> -   # prompt on stdin
codex exec ... resume --last -                                     # send check failures back / ask for the handoff
agy --model <model> --mode accept-edits -p "<prompt>"              # Gemini, run in its worktree
agy --model <model> --continue --mode accept-edits -p "<message>"  # follow-up in the same conversation
fnm exec --using=24 -- pnpm --dir frontend --filter @nexus/contracts test
fnm exec --using=24 -- pnpm --dir frontend review:check            # up to 4 rounds; failures go back to the builder
git commit -m "NEX-###: <title>"                                    # one commit on task/NEX-### (D32)
```
Claude then reviews `git diff main...task/NEX-###`, re-runs `review:check`, writes the `review:` commit,
`git merge --no-ff task/NEX-###`, and `git push origin main`.

## Model choice
| Work | Codex | Gemini |
|---|---|---|
| Contracts, fixtures, mock handlers (exact specs) | `gpt-6.2-sol`, effort `medium` | `gemini-4-neon-high` |
| Screens (UI, offline, i18n, a11y) | `gpt-6.2-astra`, effort `high` | `gemini-4-neon-xhigh` |
| Small fix after review | `gpt-6.2-sol`, effort `low` | `gemini-3.8-flash-high` |

## Approvals — how they are decided
- Builders never run commands, so no tool prompts appear; checks and commits run in the harness.
- A task that needs a **new download** (package, image, tool): the builder writes it under `Questions` and stops;
  Claude parks the task (back to `planned`) and lists it below for the Owner — never installs it.
- A builder question about the spec: Claude answers it in the task file (planner) and restarts the build.
- Security / privacy rules (V-1…V-7) are never waived to finish faster; a failing review → `changes-requested`.
- Gemini silent 90 minutes without a commit → task goes to Codex.

## Tick procedure (scheduled task `nexus-stage3-tick`, every 30 min, a fresh Claude session each time — D74)
The Owner does not approve individual steps until the Stage 3 final review. Each tick, in this order, briefly:
0. If `$O/tick.lock` exists and is younger than 50 min, stop (another tick runs). Else write it; delete it at the end.
1. `bash $O/status.sh`. Read `AGENTS.md`, `CLAUDE.md`, the board index and the Stage 3 board only as needed.
2. **Review** every task branch whose task file says `ready-for-review` (CLAUDE.md reviewer steps; security and
   privacy first). Check out the branch in `../NexusCampus-AI-review`, fix small / medium issues there, write 1
   `review:` commit (review note + `done` in task file and board), then on `main`: `git merge --no-ff task/NEX-###`
   (board conflicts: keep both rows' newest status). `bash $O/check-main.sh` must print GREEN, then `git push origin
   main`. Larger problems: `changes-requested` with numbered requests in the task file, commit on the branch, and
   start the same builder again (the harness continues the branch).
3. **Questions** (`status=questions`): answer under Questions in the task file on `main`, prefixed
   `(… answered by the planner <date>)`, `plan:` commit, start the build again.
4. **Not alive** and the branch is not ready-for-review / questions (`agent-no-changes`, `checks-failed`, or the
   process died): start it again once; a second failure → give the task to the other builder; a third → park it
   (`planned`, note under "Waiting for the Owner"). An agent quota / sign-in error in the log → use the other builder.
5. **Free builders**: give each the next `planned` task in board order whose dependencies are `done` and whose
   `Files` do not overlap a running task. Models: table above (screens → stronger models).
6. **Plan** (CLAUDE.md planner steps): keep at least 2 tasks `planned` beyond those running; ≤ 60 lines; exact
   files; check new export names against `index.ts`; new decisions in `DECISIONS.md`. `plan:` commit, push.
7. Update the task log below in the same `plan:` / merge commits; push `main`.
8. **Stop rule**: when NEX-179 is `done`, start nothing more: write "Stage 3 ready for the Owner's final review
   (NEX-180)" under "Waiting for the Owner", push, and disable the scheduled task.
Never: install packages, edit rule files other than `DECISIONS.md`, push other branches, force-push, delete worktrees
or branches, or weaken a security / privacy rule to finish faster. Keep the tick's reply to 5 lines.

## Task log
| Task | Builder · model | Started | Checks | Review | Merged / pushed |
|---|---|---|---|---|---|
| NEX-148 | Codex · default (gpt-6.2-sol) | 08:20 | green on round 3 | done — no fixes | `aa7a067`, pushed |
| NEX-150 | Gemini · default (gemini-4-neon-high) | 08:14 | green on round 3 | done — no fixes | `ce5a025`, pushed |
| NEX-149 | Codex · gpt-6.2-sol / medium | 08:40 | green on round 2 | done — fix: issue keys use `MessageKeySchema` | `1d392dc`, pushed |
| NEX-152 | Codex · gpt-6.2-sol / medium | 08:45 | green | done — fix: bounded `revokedReason`, rubric codes; personal-data notes | `3329c22`, pushed |
| NEX-151 | Gemini · gemini-4-neon-high | 09:0x | green (after a planner answer: `Fee` prefix) | done — fix: refund reason marked personal data | `1081a0b`, pushed |
| NEX-153 | Gemini · gemini-4-neon-high | 08:57 | green on round 2 | done — fix: bounded read receipts | `391dc30`, pushed |
| NEX-154 | Codex · gpt-6.2-sol / medium | 09:3x | running | — | — |

Planned next: NEX-155 (needs NEX-154), NEX-156 (needs NEX-154). Gemini waits until NEX-154 is merged (every
planned task depends on it).

## Lessons (harness)
- Two `review:check` runs at once — or the agents' own CPU use — make some UI tests time out (5 s). Checks take a
  shared lock (`checks.lock`), and a test-only failure is re-run file by file: load timeouts pass alone, real failures
  fail again (`lib.sh` `full_check`).
- Codex `workspace-write` keeps `.git` read-only and hides fnm/pnpm, so the harness — not the builder — runs checks and
  commits. Planner answers in a task's Questions are marked "answered by the planner" so the harness continues.

- Builders cannot run `export:fixtures`, so new message keys would leave the backend key list stale: the harness now
  runs it before `review:check` (`full_check … export`, D75); `check-main.sh` does not, so a stale export on `main`
  still fails.

## Waiting for the Owner
_(nothing yet)_
