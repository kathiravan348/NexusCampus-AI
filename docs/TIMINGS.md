# NexusCampus — Startup & test timings

> Living log for `AGENTS.md` §8a (D37). Budgets are **soft**: a slower run prints `WARN: over budget` and never fails.
> Budgets live in `frontend/scripts/timing-budgets.ts` (browser boot: `apps/campus/src/bootTiming.ts`); change both
> here and there in the task that changes them. Re-measure with `fnm exec --using=24 -- pnpm --dir frontend timings:measure`.

## How times are printed
- Every start, build, test and check command is wrapped by `frontend/scripts/time-run.ts` and prints
  `[timing] <label>: X.XXs (budget Y.Ys — OK | WARN: over budget)`; the exit code is the command's own.
- Servers (`dev`, `preview`, Storybook `dev`) print `[timing] <label> ready: …` when their ready line appears
  (`--ready-pattern`); the measure script also passes `--exit-after-ready` and ends the whole process tree.
- `review:check` runs its steps with `--sequence` and prints a per-step table plus the total.
- Root Vitest runs (`pnpm test`, `check:test`) add a reporter block: time per project, the 5 slowest test files and
  the `check:test` budget. Per-package `test` prints `[timing] test:<package>`.
- The campus dev build logs `[timing] boot:campus …` in the browser console (navigation start → entry → MSW ready →
  React mounted). Production builds log nothing.

## Soft budgets

| Key | What | Budget |
|---|---|---|
| `dev:campus` | campus Vite dev server ready | 8s |
| `preview:campus` | campus preview server ready (after build) | 5s |
| `dev:storybook` | Storybook dev server ready | 30s |
| `boot:campus` | browser dev cold boot to React mounted | 3s |
| `build:campus` | campus production build | 45s |
| `build:storybook` | static Storybook build | 2m |
| `build:all` | `pnpm build` (all packages) | 3m |
| `check:format` | Prettier check | 30s |
| `check:lint` | ESLint (all packages + `scripts/`), token/class checks | 1m 30s |
| `check:typecheck` | `tsc` (all packages + `scripts/`) | 1m 30s |
| `check:test` | workspace Vitest run | 2m |
| `review:check` | format → lint → typecheck → test → build | 7m |
| `test:pkg` | one package's `test` | 45s |
| `e2e` | Playwright smoke / languages / offline (NEX-021, NEX-040) | 3m |
| `dev:control` | Nexus Control dev server (reserved, Stage 2) | 8s |
| `backend:start` | `nexus-dev`: FastAPI ready (NEX-042) | 15s |
| `backend:check` | `backend-check`: ruff format + ruff lint + mypy strict + pytest (NEX-042) | 3m |
| `compose:up` | `nexus-compose-up`: PostgreSQL + Redis healthy (NEX-042) | 1m 30s |

## Measured baselines

Owner PC (Windows 11, Node 24.21, pnpm), 2026-11-20, `timings:measure` (cold = bundler caches removed first).

| Place | Key | Cold | Warm | Budget | Status |
|---|---|---|---|---|---|
| campus dev server | `dev:campus` | 0.75s | 0.37s | 8s | OK |
| campus build | `build:campus` | 5.44s | — | 45s | OK |
| campus preview (built) | `preview:campus` | 0.36s | 0.36s | 5s | OK |
| Storybook dev server (manager ready; stories compile on first open) | `dev:storybook` | 2.77s | 1.64s | 30s | OK |
| campus browser dev boot (entry 1.47s → MSW ready 1.61s → mounted) | `boot:campus` | 1.63s | — | 3s | OK |

| `review:check` step | Time | Budget | Status |
|---|---|---|---|
| check:format | 2.83s | 30s | OK |
| check:lint | 8.92s | 1m 30s | OK |
| check:typecheck | 6.40s | 1m 30s | OK |
| check:test (160 files) | 39.02s | 2m | OK |
| build:all (campus 5.8s, Storybook 7.8s, in parallel) | 7.96s | 3m | OK |
| **total** | **1m 05.1s** | 7m | OK |

| Review build | Key | Time | Budget | Status |
|---|---|---|---|---|
| `review:start` build step (`--mode review`) | `build:campus` | 4.90s | 45s | OK |
| `review:start` preview ready | `preview:campus` | 0.37s | 5s | OK |
| `pnpm e2e` (24 tests: smoke ×10, rtl ×2, pseudo ×6, offline ×2, a11y ×4; incl. review build + dev server) | `e2e` | 28.87s | 3m | OK |

Per package (`pnpm --filter <pkg> test`): campus 23.62s (70 files), ui-core 6.74s. In the workspace run, campus holds
~85% of summed file time; slowest files are the M04/M03 studio pages and M02 role/user screens (~3–3.6s each).

## Backend (NEX-042)

| Place | Key | Time | Budget | Status |
|---|---|---|---|---|
| `uv run --project backend backend-check` (format 0.10s · lint 0.09s · typecheck 0.59s · test 4.30s, 19 tests) | `backend:check` | 5.08s | 3m | OK |
| `uv run --project backend nexus-dev` to ready | `backend:start` | 1.60s | 15s | OK |
| `uv run --project backend nexus-compose-up` (PostgreSQL + Redis healthy) | `compose:up` | 18.29s | 1m 30s | OK |
| `nexus-compose-up` with Keycloak (NEX-045; PostgreSQL + Redis + Keycloak healthy) | `compose:up` | 32.64s | 1m 30s | OK |

## Reserved (no surface yet — fill in the task that adds it)

| Place | Key | Cold | Warm | Budget | Measured in |
|---|---|---|---|---|---|
| Nexus Control dev | `dev:control` | — | — | 8s | Stage 2 |

## Change log

| Date | Task | Change |
|---|---|---|
| 2026-11-20 | NEX-032 | Harness, budgets and first baselines. |
| 2026-11-20 | NEX-021 | `e2e` and `review:start` baselines; `e2e` moved from reserved to measured. |
| 2026-11-20 | NEX-042 | `backend:start`, `backend:check`, `compose:up` measured (moved from reserved). |
| 2026-11-20 | NEX-045 | `compose:up` with Keycloak: 32.64s. |
