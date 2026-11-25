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
| Backend: DB + API (lane D, migrations, RLS, encryption) | `gpt-6.2-astra`, effort `high` | — (Codex only) |
| Small fix after review | `gpt-6.2-sol`, effort `low` | `gemini-3.8-flash-high` |

## Approvals — how they are decided
- Builders never run commands, so no tool prompts appear; checks and commits run in the harness.
- A task that needs a **new download** (package, image, tool): the builder writes it under `Questions` and stops;
  Claude parks the task (back to `planned`) and lists it below for the Owner — never installs it.
- A builder question about the spec: Claude answers it in the task file (planner) and restarts the build.
- Security / privacy rules (V-1…V-7) are never waived to finish faster; a failing review → `changes-requested`.
- Gemini silent 90 minutes without a commit → task goes to Codex.

## Tick procedure — build step (scheduled task `nexus-stage3-tick`, every 30 min; Owner OK 2026-11-25)
Owner, 2026-11-25: "push main and keep the build going" → "rewrite and enable". Each tick is a fresh Claude
session that reviews, merges, pushes `main` after a green check, answers builders, starts builds and plans, without
asking the Owner, until the stop rule. In this order, briefly (`O` = the orchestrator folder):
0. **Lock:** if `$O/tick.lock` says `claude-build` and is younger than 4 h, or any other `tick.lock` is younger than
   50 min, stop (another tick or an interactive Claude session
   is working). Else write it; delete it at the end.
1. **Stack and status:** `uv run --project backend nexus-compose-up` (idempotent; images are local; ports
   55432/56379/58080/58200) — the harness's backend check needs the database. Then `bash $O/status.sh`. Read
   `AGENTS.md`, `CLAUDE.md`, the board index and the Stage 3 board only as needed.
2. **Review** every task branch whose task file says `ready-for-review` (CLAUDE.md reviewer steps). Security and
   privacy first: forced RLS on every new table, composite `(id, tenant_id)` references, `nexus_app` grants only as
   needed, permission and module guard before the body is read, audit with field names only, sensitive columns
   field-encrypted and listed in `ENCRYPTED_COLUMNS`, sensitive reads audited (E-3), no personal data in logs.
   Re-read the harness check: backend tasks must show `GREEN (backend-check, DB required)` with 0 skipped DB tests.
   Screen tasks: in `../NexusCampus-AI-review` run `fnm exec --using=24 -- pnpm --dir frontend e2e` on the branch.
   Fix small / medium issues there, write 1 `review:` commit (review note + `done` in task file and board), detach
   the builder's worktree if it holds the branch, then on `main`: `git merge --no-ff task/NEX-###` (shared docs and
   board conflicts: keep both sides, newest status). `bash $O/check-main.sh` must print GREEN (frontend and
   backend), then `git push origin main`. RED on `main`: do not push, start no further merges, find the cause; fix it
   as a `review:` follow-up or write it under "Waiting for the Owner". Larger problems in a branch:
   `changes-requested` with numbered requests in the Review section (step 3 shows how to keep the branch).
3. **Questions** (`status=questions`): the harness has committed the builder's work as `NEX-###: questions for the
   planner (harness)`. In the builder's worktree on that branch: answer each question on the line below it with the
   exact lowercase phrase `answered by the planner` (the harness checks it), set **Status** to `changes-requested`,
   put numbered requests in Review, `git commit --amend --no-edit` (stays within D32), `git checkout --detach`, then
   start the same builder again — it continues the branch. Never delete a branch to restart.
4. **Not alive** and the branch is not ready-for-review / questions (`agent-no-changes`, `checks-failed`, or the
   process died): start it again once; a second failure → the other builder; a third → park it (`planned`, note
   under "Waiting for the Owner"). An agent quota / sign-in error in the log → use the other builder.
5. **Free builders:** give each the next `planned` task in board order whose dependencies are `done` and whose
   `Files` do not overlap a running task. **Only one task that adds a migration (lane D) runs at a time** — the
   migration chain is linear, so the next one starts after the previous one is merged. Models: table below.
6. **Plan** (CLAUDE.md planner steps): keep 2 tasks `planned` beyond those running (≤ 60 lines; exact files,
   including tests that hard-code totals; the next migration number; the encrypted-column registry; the audit naming
   rule — camelCase, no underscores). Split a task that is too big into a new ID. New decisions in `DECISIONS.md`.
   `plan:` commit, push.
7. Update the task log below in the same commits; push `main`.
8. **Stop rule:** when NEX-199 is `done`, or when only tasks that need the Owner remain, start nothing more: write
   "Stage 3 build ready for the Owner's release review" (or what is waiting) under "Waiting for the Owner", push, and
   disable the scheduled task.
9. **Claude builds (D82)** when Codex is unavailable (usage limit, sign-in error, or failed twice) and a task is ready
   to start or continue — instead of waiting for the reset. Gate: `get_usage` 5-hour **and** weekly below 80 % used
   (20 % stays for planning and reviewing); check again before each build step and stop at a commit point at 80 %.
   Do steps 1–8 first, then write `claude-build NEX-### <time>` into `tick.lock`. Worktree `../NexusCampus-AI-claude`
   (`git worktree add` it once if missing; a branch held by the Codex worktree: set `changes-requested` with "finish"
   requests and detach that worktree first). Follow the `GEMINI.md` implementer steps with owner `Claude`, run
   `fnm exec --using=24 -- pnpm --dir frontend review:check` and, for `backend/`, `uv run --project backend
   backend-check` with `NEXUS_REQUIRE_DB=1`; max 3 commits; status `ready-for-review`, task log row "Claude · <model>".
   Out of budget mid-task → commit what is green as `NEX-###: partial (Claude, budget)`, status `changes-requested`
   with numbered "finish" requests, so Codex or a later tick continues. Never review your own build: Codex reviews it
   (D68); the harness has no review run yet, so list it under "Waiting for the Owner" as "NEX-### needs Codex
   review" and keep building other tasks. When Codex's limit resets, Codex gets the next task again.
10. **Codex review of a Claude build (D68, Owner 21:5x):** start it with `bash $O/start-review.sh NEX-### gpt-6.2-astra high`
   (detached; Codex reviews and edits files only, the harness runs the checks and writes 1 `review:` commit, then detaches).
   Result in `$O/logs/codex.state`: `reviewed-done` → on `main` `git merge --no-ff task/NEX-###`, `check-main.sh` GREEN,
   push; `reviewed-changes-requested` → the requests are built like step 4 (Codex, or Claude under D82 — then Codex
   reviews again); `review-checks-failed` / `review-no-changes` → restart once, then "Waiting for the Owner".
Never: install packages, edit rule files other than `DECISIONS.md`, push other branches, force-push, delete worktrees
or branches, change a frozen contract or screen without a task the Owner approved (D78), or weaken a security /
privacy rule to finish faster. Keep the tick's reply to 5 lines.

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
| NEX-173 | Gemini · gemini-4-neon-xhigh (screen) | 21:48 (Codex at usage limit) | green | done — no fixes | `36c1590`, pushed |
| NEX-174 | Gemini · gemini-4-neon-xhigh (screen) | 22:43 (Codex at usage limit) | green | done — no fixes | merged 23:4x, pushed |
| NEX-175 | Gemini · gemini-4-neon-xhigh (screen) | 23:38 (Codex at usage limit) | green | done — no fixes | `d53fc80`, pushed |
| NEX-176 | Codex · gpt-6.2-astra / high (screen) | 00:2x (Owner: Codex) | green | done — no fixes | merged 00:4x, pushed |
| NEX-177 | Codex · gpt-6.2-astra / high (screen) | 00:43 | green | done — no fixes | `4ac5dc4`, pushed |
| NEX-178 | Codex · gpt-6.2-astra / high (screen) | 01:13 | green | done — fix: reason keys via `isKnownMessageKey` (no cross-package `en.json` import) | `e62df0e`, pushed |
| NEX-179 | Codex · gpt-6.2-astra / high (review build) | 01:47 | green (review:check); reviewer e2e 02:1x: 46 failed (menu 403s) → NEX-181; with NEX-181 03:4x: 72 passed, 1 a11y load timeout (passes alone) | done — fix: merged `main`, `texts:export` refreshed | merged 03:5x, pushed |
| NEX-181 | Codex · gpt-6.2-astra / high (fix from NEX-179 e2e, D77) | 02:1x; 2 questions (staff rule, portal role) answered 02:4x, restarted; 3rd question (guardian without learner) answered 03:1x, restarted | green (1,997 tests) | done — no fixes; e2e proved on NEX-179 | `8ed758b`, pushed |
| NEX-200 | Codex · gpt-6.2-astra / high (lane D, `0025`) | 12:5x; locale question answered, restarted | green (2031 frontend; backend 528, 0 skipped) | done — no fixes | merged 14:1x, pushed |
| NEX-184 | Codex · gpt-6.2-astra / high (lane D, `0026`) | 14:15 (tick) | red ×4 on format / lint / mypy only (533 tests green); reviewer fixed, green (backend 533, 0 skipped; main 2035 frontend) | done — fix: `ruff format`, list literals, `noqa: S608` on fixed-table cleanup, `Select[Learner]` type | merged 15:1x, pushed |
| NEX-202 | Codex · gpt-6.2-astra / high (lane D, `0027`) | 15:18 (tick) — Codex usage limit until 16:42, no changes; restarted 16:43 (tick); 2 questions (households for tenant-wide readers, contract imports) answered 16:5x, restarted; locale-alias question answered 17:1x (use `is_locale`, `iw-IL` an accepted gap), restarted | green (2035 frontend; backend 538, 0 skipped) | done — fix: model `locale_valid` CHECK matched to migration | merged 17:4x; main GREEN, push blocked (see Waiting) |
| NEX-185 | Codex · gpt-6.2-astra / high (lane D, `0028`); round 5 Claude · claude-opus-5-5 (D82) | 17:47 (tick); institution-precedence question answered 18:1x (follow the mock), restarted; checks-failed 19:0x (test sign-in), restarted → Codex usage limit until 21:43; Claude built the test fix 19:4x | green (backend 543, 0 skipped; frontend 348 files after the usual re-run) | done — Codex review fixes (stopped at its limit) + Claude self-review (D83) | merged 22:5x, pushed |
| NEX-204 | Claude · claude-opus-5-5 (D83, lane D, `0029`) | 22:5x | green (backend 552, 0 skipped) | done — self-review fix: public paths in the route-guard tests | merged 23:2x, pushed |
| NEX-203 | Claude · claude-opus-5-5 (D83, lane D, `0030`) | 23:2x | green (backend 558, 0 skipped) | done — no fixes | merged 23:4x, pushed |
| NEX-187 | Claude · claude-opus-5-5 (D83, lane D, `0031`) | 23:5x | green (backend 565, 0 skipped) | done — no fixes | merged 00:2x, pushed |
| NEX-205 | Claude · claude-opus-5-5 (D83, lane D, `0032`) | 00:3x | green (backend 571, 0 skipped) | done — no fixes | merged 00:5x, pushed |
| NEX-188 | Claude · claude-opus-5-5 (D83, lane D, `0033`) | 01:0x | green (backend 576, 0 skipped) | done — no fixes | merged 01:3x, pushed |
| NEX-206 | Claude · claude-opus-5-5 (D83, lane D, `0034`) | 01:4x | green (backend 580, 0 skipped) | done — no fixes | merged 01:5x, pushed |
| NEX-189 | Claude · claude-opus-5-5 (D83, lane D, `0035`) | 02:1x | green (backend 585, 0 skipped) | done — self-review fix: family helper takes the module's read permission | merged 02:3x, pushed |
| NEX-207 | Claude · claude-opus-5-5 (D83, lane D, `0036`) | 02:4x | green (backend 590, 0 skipped) | done — no fixes | merged 03:0x, pushed |
| NEX-190 | — (planned 03:0x, lane D, `0037`, M22 + M23) | — | — | — | — |

NEX-179 e2e (02:1x): the new persona smoke — and the existing admin smoke and a11y specs, already red on `main` — fail
because modules with `permission: null` show in every menu and their screens answer 403 (admin → `/family`, teacher →
`/fees`, guardian → `/staff`, learner → `/families` with 404s). Planner wrote NEX-181 (D77) on Codex. When it is merged:
merge `main` into `task/NEX-179`, run `pnpm --dir frontend e2e` and `texts:export`, write the review, merge. Then the
stop rule applies (NEX-179 and NEX-181 done). The reviewer runs `pnpm --dir frontend e2e` and `texts:export` (builders
cannot). Nothing further to plan: NEX-180 is the Owner's freeze; Gemini stays idle. When NEX-179 is done the stop rule applies.
Each remaining screen task shares `modules.ts` with the running one, so one builder waits.
Owner (23:59): give the next task, NEX-176, to Codex (`gpt-6.2-astra` / `high`) once NEX-175 is merged. Codex's usage
limit ended 23:52. If Codex hits a usage limit again, or fails twice, use Gemini (tick step 4).
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

- `pnpm e2e` is not in `review:check`, so menu / route regressions reach `main` unseen (NEX-179 found 403 menu links
  from NEX-160–178). Run `pnpm --dir frontend e2e` when reviewing a task that adds a menu entry.

- To move a half-built branch to the other builder, set it `changes-requested` (numbered "finish" requests) and
  detach the first worktree (`git checkout --detach`) so the other worktree can check the branch out (NEX-172).

## Waiting for the Owner
- 2026-11-25 03:5x — **Stage 3 ready for the Owner's final review (NEX-180).** NEX-179 and NEX-181 are done and
  merged. Gemini's worktree still has `task/NEX-175` (merged) checked out; nothing is running.
- 2026-11-25 — The scheduled task `nexus-stage3-tick` is disabled (Owner's OK in chat). Review pack ready: user
  manual with Stage 3 examples, presentation updated, demo on http://localhost:4173, checklist in
  [`OWNER-CHECKLIST.md`](../../review/OWNER-CHECKLIST.md) section A.
- 2026-11-25 — Owner: "fix the 4 points, then approve the Stage 3 freeze". Points 1–2 fixed in NEX-182 (Codex
  `gpt-6.2-sol` low; reviewer ran the fixture export and updated two portal tests), merged. Points 3–4 planned as
  build tasks. **Stage 3 frozen (NEX-180, D78)**; build step NEX-183–199 on the board as draft. Nothing is running;
  the first two build task files are written when the Owner says to start the build.
- 2026-11-25 — Owner: "push main and start the Stage 3 build". Dev stack started (`nexus-compose-up`); the harness
  now also runs `backend-check` with `NEXUS_REQUIRE_DB=1` whenever `backend/` changes (and always on `main`), and ends
  a red backend check with an error summary for the builder — before this, 267 database tests were skipped silently.
  NEX-183 (Codex, two rounds of planner answers) and NEX-186 (Gemini) reviewed, live-checked and merged; `main`
  green (2031 frontend, 522 backend). Follow-up NEX-201 (public form language). NEX-200 (Codex) and NEX-201
  (Gemini) building. Not pushed since the first push — waiting for the Owner.
- 2026-11-25 14:1x (tick) — NEX-200 merged, `main` green and pushed. NEX-184 building on Codex. NEX-202 and NEX-185
  planned; NEX-185 split (public endpoint + abuse limits → NEX-204, M09 import jobs → NEX-203). Every open task
  before NEX-194 is lane D (Codex only, one migration at a time), so Gemini stays idle until then — not blocking.
- 2026-11-25 15:1x (tick) — NEX-184 merged, `main` green and pushed. NEX-202 could not start: Codex usage limit until
  16:42; a later tick restarts it. NEX-202 and NEX-185 stay planned; Gemini idle (lane D only) — not blocking.
- 2026-11-25 16:4x (tick) — NEX-202 restarted on Codex after its usage limit. NEX-204 planned (public enquiry
  endpoint, migration `0029`, abuse limits D81). Planned ahead: NEX-185, NEX-204. Gemini idle (lane D only) — not blocking.
- 2026-11-25 17:1x (tick) — NEX-202 asked about locale aliases; answered (use `nexus.core.validation.is_locale`, no
  canonicaliser), restarted on Codex. Planned ahead: NEX-185, NEX-204. Gemini idle (lane D only) — not blocking.
- 2026-11-25 17:4x (tick) — NEX-202 reviewed (1 fix) and merged; `check-main.sh` GREEN (frontend after the usual
  load-timeout re-run, backend DB required). **`git push origin main` was refused by the session's auto-mode permission
  check** — `main` is ahead of `origin` by the NEX-202 merge and this plan commit; the Owner pushes or allows the push
  for the scheduled task. NEX-185 started on Codex. NEX-203 planned (M09, `0030`). Planned ahead: NEX-204, NEX-203.
- 2026-11-25 18:1x (tick) — `main` was already in sync with `origin` (the 17:4x push is done). NEX-185 asked which
  institution owns an enquiry; answered (follow the frozen mock: program → campus → staff → first), restarted on Codex.
  Planned ahead: NEX-204, NEX-203. Gemini idle (lane D only) — not blocking.
- 2026-11-25 19:1x (tick) — NEX-185 ended `checks-failed` (4 rounds; only its new DB test's hand-made session is
  rejected, 538 other backend tests green). Change requests added (use `tests.db.auth_fixtures`), restarted on Codex
  (1st restart). Planned ahead: NEX-204, NEX-203. Gemini idle (lane D only) — not blocking. Push of this plan
  commit was refused by the auto-mode permission check; `main` is 1 commit ahead of `origin` (no code change).
- 2026-11-25 19:4x (tick) — Codex hit its usage limit (until 21:43), so Claude built NEX-185's change requests 4–5 under D82 (tests on the shared sign-in fixtures; `backend-check` DB required green, 543 passed, 0 skipped; `review:check` green). **NEX-185 needs Codex review** (D68) — the harness has no review run; a later tick or the Owner starts it once Codex's limit resets. NEX-204 / NEX-203 stay planned (lane D waits for NEX-185). Gemini idle.
- 2026-11-25 21:0x (tick) — No change: NEX-185 still needs Codex review (D68; Codex limit until 21:43, no harness review
  run). Every next task (NEX-204, NEX-203, then NEX-187–195) is lane D and waits for NEX-185's migration `0028`, so
  nothing started and Claude did not build. Planned ahead: NEX-204, NEX-203. Gemini idle — not blocking.
- 2026-11-25 21:4x (tick) — No change: Codex's limit has reset (21:43), but NEX-185 still needs a Codex review (D68)
  and the harness has no review run, so the Owner starts it. NEX-204, NEX-203 and the later lane D tasks wait for
  NEX-185's migration `0028`; nothing started, Claude did not build. Planned ahead: NEX-204, NEX-203. Gemini idle.
- 2026-11-25 21:5x — Owner: "Start Codex review". New `$O/start-review.sh` / `run-review.sh` (tick step 10): Codex
  (`gpt-6.2-astra` / high) is reviewing NEX-185 in its worktree; the harness checks and commits the `review:`; a later
  tick merges it on `reviewed-done`, then lane D continues with NEX-204.
- 2026-11-25 22:1x (tick) — **Stop rule: only work that needs the Owner remains.** Codex's review of NEX-185 stopped
  at 21:58: Codex hit a usage limit until **2026-11-30 16:41**. It left review fixes on `task/NEX-185` (`5d5db55`:
  migration `0028`, m12 models / router / schemas / service, tests, API and DATABASE guides; harness check GREEN,
  backend 544 passed, 0 skipped) but no verdict or review note (status `in-review`, owner Codex). Claude cannot review
  its own build (D68), and NEX-204, NEX-203 and NEX-187–195 all wait for NEX-185's migration `0028`, so nothing can
  start. Disabling `nexus-stage3-tick` needs the Owner's approval (refused in the unattended run) — **Owner: disable it**; later ticks find nothing to do. Owner decides: wait for Codex (restart with
  `bash $O/start-review.sh NEX-185 gpt-6.2-astra high` after 11-30 16:41), or name another reviewer for NEX-185.
- 2026-11-25 22:4x — **Owner: Claude takes full control of Stage 3 (D83).** Codex and Gemini are at their weekly
  limits; Claude plans, builds and self-reviews each task, merges after `check-main.sh` GREEN and pushes, using its
  full plan (D82's 80 % gate does not apply) and continuing after a limit reset. The scheduler stays disabled.
  NEX-185 merged (Codex review fixes + Claude self-review); `main` GREEN (2035 frontend; backend DB required).
  Lesson: never run DB tests in a worktree while `check-main.sh` runs — both migrate test databases on the same
  server and the shared role update collides ("tuple concurrently updated").
