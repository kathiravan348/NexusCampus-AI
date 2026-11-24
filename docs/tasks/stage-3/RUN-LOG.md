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
| NEX-154 | Codex · gpt-6.2-sol / medium | 09:3x | green | done — no fixes | `007120a`, pushed |
| NEX-155 | Gemini · gemini-4-neon-high | 09:45 | green | done — no fixes | `0fff900`, pushed |
| NEX-156 | Codex · gpt-6.2-sol / medium | 09:45, restarted 10:08 | not run by the harness (answered questions misread as open); reviewer ran them: green | done — fix: locked demo user in `m14.test.ts`; backend key export | `4915913`, pushed |
| NEX-157 | Codex · gpt-6.2-sol / medium | 10:5x | green | done — no fixes | `eda6b25`, pushed |
| NEX-158 | Codex · gpt-6.2-sol / medium | 11:15 | green | done — no fixes | `88e57fa`, pushed |
| NEX-160 | Gemini · gemini-4-neon-xhigh (screen) | 11:0x | green | done — no fixes (backend key export regenerated at merge) | `3470608`, pushed |
| NEX-163 | Gemini · gemini-4-neon-xhigh (screen) | 11:43 | green | done — no fixes (backend key export regenerated at merge) | `61946d2`, pushed |
| NEX-159 | Codex · gpt-6.2-sol / medium | 11:43, question answered, restarted 11:47 | green | done — no fixes | `ce7f068`, pushed |
| NEX-161 | Codex · gpt-6.2-astra / high (screen) | 12:42, question answered, restarted 12:50 | green | done — no fixes (backend key export regenerated at merge) | `d4afc81`, pushed |
| NEX-162 | Gemini · gemini-4-neon-xhigh (screen) | 13:12 | green | done — no fixes | `fe58ffe`, pushed |
| NEX-164 | Codex · gpt-6.2-astra / high (screen) | 13:43 | green | done — no fixes | `acfc8c6`, pushed |
| NEX-165 | Gemini · gemini-4-neon-xhigh (screen) | 14:2x | green | done — no fixes | `5f89b7a`, pushed |
| NEX-166 | Codex · gpt-6.2-astra / high (screen) | 15:13 | green | done — no fixes | `15fcddf`, pushed |
| NEX-167 | Gemini · gemini-4-neon-xhigh (screen) | 15:43 | green | done — no fixes | `0a2069c`, pushed |
| NEX-168 | Codex · gpt-6.2-astra / high (screen) | 16:43 | red ×4 (Prettier only, then 3 type errors); reviewer fixed, green | done — fix: format, MSW listen option, `root?.["…"]` access | merge after `71b6fc4`, pushed |
| NEX-169 | Gemini · gemini-4-neon-xhigh (screen) | 17:19 | red ×4 (type errors); reviewer fixed, green | done — fix: `scores?.set` null guard in `MarkSheet.tsx` | `5da5c24`, pushed |
| NEX-170 | Codex · gpt-6.2-astra / high (screen) | 18:49; docs-only "ready" with a question 18:58, answered, restarted 19:1x | green | done — fix: seat labels past room 26 (`AA1`…) | `c9c5aa6`, pushed |
| NEX-171 | Codex · gpt-6.2-astra / high (screen) | 19:44 | green | done — no fixes | `2ddc5d9`, pushed |
| NEX-172 | Codex · gpt-6.2-astra / high (screen) → Gemini · gemini-4-neon-xhigh | 20:13; question answered, restarted 20:17; Codex usage limit (until 23:52) after round 1, red on Prettier only; reviewer formatted, changes-requested (remaining build) → Gemini 20:48 | green | done — fix: list / view typed as `IssuedDocumentRead` | `3e1802a`, pushed |
| NEX-173 | Gemini · gemini-4-neon-xhigh (screen) | 21:48 (Codex at usage limit) | running | — | — |

Planned next: NEX-174 (M25 family portal home; after NEX-173) and NEX-175 (M26 learner portal; after NEX-174).
Each remaining screen task shares `modules.ts` with the running one, so one builder waits.
Codex is at its usage limit until 23:52 (20:20): give new builds to Gemini until then.
`m0x.*` keys to the message files; they run one at a time (start the next when the running screen task is merged).
Screen tasks and handler tasks both add keys to `messages/{en,hi,ta}.json` in different module blocks; at merge keep both,
and re-run `--filter @nexus/mocks export:fixtures` when `backend/.../message_keys.json` or `icu_cases.json` conflict.

## Lessons (harness)
- Two `review:check` runs at once — or the agents' own CPU use — make some UI tests time out (5 s). Checks take a
  shared lock (`checks.lock`), and a test-only failure is re-run file by file: load timeouts pass alone, real failures
  fail again (`lib.sh` `full_check`).
- Codex `workspace-write` keeps `.git` read-only and hides fnm/pnpm, so the harness — not the builder — runs checks and
  commits. Planner answers in a task's Questions are marked "answered by the planner" so the harness continues.

- Builders cannot run `export:fixtures`, so new message keys would leave the backend key list stale: the harness now
  runs it before `review:check` (`full_check … export`, D75); `check-main.sh` does not, so a stale export on `main`
  still fails.

- The harness checked each Questions line on its own, so a question answered on the following lines still looked
  open and the build was committed without checks (NEX-156). `open_questions` now reads each question as a block.

- Task branches are checked out in the builder worktrees, so `review:` commits are made there (builder not alive).
- A planner answer written only on `main` conflicts with the branch's own Questions line when the harness merges
  `main` (merge output is silenced): copy the same answer onto the branch too, so the merge is clean (NEX-159).
- Piping `start-build.sh` (e.g. `| tail`) keeps the tick's shell waiting on the detached build's inherited output;
  run it without a pipe and read `status.sh` afterwards.

- Builders cannot run Prettier: a build that is red on `check:format` only stays red for all 4 rounds (NEX-168).
  The reviewer runs `prettier --write` on the task's files in the builder worktree and re-checks.

- A question written as plain text (not a `- ` line) is missed by `open_questions`: the build ran green checks on a
  docs-only change and was marked ready-for-review (NEX-170). The reviewer checks the diff has code before reviewing;
  a restart from a non-`changes-requested` branch rebuilds it fresh from `main`.

- To move a half-built branch to the other builder, set it `changes-requested` (numbered "finish" requests) and
  detach the first worktree (`git checkout --detach`) so the other worktree can check the branch out (NEX-172).

## Waiting for the Owner
_(nothing yet)_
