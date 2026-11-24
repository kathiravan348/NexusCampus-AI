# Stage 3 — automated run log (D73)

> One page for the Owner: how Claude drives the builders, the exact commands, which model each task used, how
> approvals are decided, and where every task stands. Claude updates it with each plan / review commit on `main`.

## Set-up
| Builder | Tool (CLI) | Folder (git worktree) | Can do |
|---|---|---|---|
| Codex | `codex` 0.171.0 (`%LOCALAPPDATA%\pnpm\bin\codex.cmd`, run via `fnm exec --using=24 --`) | `../NexusCampus-AI-codex` | edit files only (sandbox `workspace-write`, no network) |
| Gemini | `agy` 1.5.15 (`%LOCALAPPDATA%\agy\bin\agy.exe`) | `../NexusCampus-AI-gemini` | edit files only (`--mode accept-edits`) |
| Claude | this session | `NexusCampus-AI` (`main`) | plan, run checks, review, merge, push |

Harness (outside the repo): `../NexusCampus-AI-orchestrator/run-builder.sh`; logs in `../NexusCampus-AI-orchestrator/logs/`.

## Commands Claude gives
```
# start a build (Claude runs this in the background)
bash ../NexusCampus-AI-orchestrator/run-builder.sh <codex|gemini> NEX-### <model> <effort>

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

## Task log
| Task | Builder · model | Started | Checks | Review | Merged / pushed |
|---|---|---|---|---|---|
| NEX-148 | Codex · default (gpt-6.2-sol) | 08:20 | green on round 3 | done — no fixes | `aa7a067`, pushed |
| NEX-150 | Gemini · default (gemini-4-neon-high) | 08:14 | green on round 3 | done — no fixes | `ce5a025`, pushed |
| NEX-149 | Codex · gpt-6.2-sol / medium | 08:5x | running | — | — |
| NEX-151 | Gemini · gemini-4-neon-high | 09:0x | restarted after a planner answer (`Fee` prefix: Stage 2 `Invoice*` / `Payment*` exports clash) | — | — |

Planned next: NEX-152 (M20–M23), NEX-153 (M24–M28, M86).

## Lessons (harness)
- Two `review:check` runs at once make UI tests time out (5 s); the harness now takes a shared lock
  (`../NexusCampus-AI-orchestrator/checks.lock`) so only one check suite runs at a time.
- Codex `workspace-write` keeps `.git` read-only and hides fnm/pnpm, so the harness — not the builder — runs checks and
  commits. Planner answers in a task's Questions are marked "answered by the planner" so the harness continues.

## Waiting for the Owner
_(nothing yet)_
