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
| `dev:control` | Nexus Control dev server (NEX-071) | 8s |
| `build:control` | Nexus Control production build (NEX-071) | 45s |
| `preview:control` | Nexus Control preview server (NEX-071) | 5s |
| `backend:start` | `nexus-dev`: FastAPI ready (NEX-042) | 15s |
| `backend:check` | `backend-check`: ruff format + ruff lint + mypy strict + pytest (NEX-042) | 3m |
| `compose:up` | `nexus-compose-up`: PostgreSQL + Redis healthy (NEX-042) | 1m 30s |
| `api:list:p95` | p95 of every list endpoint, first page (`pageSize=50`), demo data, 20 calls each (NEX-065) | 300ms |
| `load:4g` | cold first load of the built app to the sign-in button, 4G profile (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up) (NEX-065) | 6s |

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
| Self-hosted install `deploy/compose/scripts/install.sh` with demo seed (NEX-064; images cached, all 7 services healthy) | `compose:up` | 74.87s fresh · 17.26s re-run | 1m 30s | OK |

## Real mode on demo data (NEX-065)

Measured with the opt-in `e2e/real/perf.spec.ts` (`pnpm --dir frontend e2e:real perf.spec.ts`; backend `nexus-dev`,
app `dev:real` on 3100, built app `pnpm --filter campus real:build` + `real:preview` on 3101).

| Place | Key | Time | Budget | Status |
|---|---|---|---|---|
| 24 list endpoints × 20 calls via the dev proxy (slowest: `usage` p95 39 ms, `roles` 28 ms) | `api:list:p95` | 11–29 ms | 300ms | OK |
| Built real-mode app, cold, 4G profile, 322 KiB transferred | `load:4g` | 2.18s | 6s | OK |
| Nexus Control dev server, warm, Owner PC (NEX-071) | `dev:control` | 0.36s | 8s | OK |
| Nexus Control production build (NEX-071) | `build:control` | 3.14s | 45s | OK |

## Reserved (no surface yet — fill in the task that adds it)

| Place | Key | Cold | Warm | Budget | Measured in |
|---|---|---|---|---|---|
| _(none)_ | | | | | |

## Change log

| Date | Task | Change |
|---|---|---|
| 2026-11-20 | NEX-032 | Harness, budgets and first baselines. |
| 2026-11-20 | NEX-021 | `e2e` and `review:start` baselines; `e2e` moved from reserved to measured. |
| 2026-11-20 | NEX-042 | `backend:start`, `backend:check`, `compose:up` measured (moved from reserved). |
| 2026-11-20 | NEX-045 | `compose:up` with Keycloak: 32.64s. |
| 2026-11-21 | NEX-064 | `compose:up` self-hosted install: 74.87s fresh with demo seed, 17.26s re-run. |
| 2026-11-21 | NEX-065 | `api:list:p95` (300ms) and `load:4g` (6s) budgets added and measured. |
