# NexusCampus

A multi-tenant platform for every kind of learning institution, from play schools to universities and private
institutes. It works offline, and AI features are optional. What it covers: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
Plan and stages: [`docs/PLAN.md`](docs/PLAN.md).

> **Current state: Stage 2 — Nexus Control & delivery, built; next: the Owner's release review.**
> Stage 1 (M01–M07, M10, M11, M83) was released on 2026-11-21. Stage 2 adds **Nexus Control**, our own provider app (P01–P18:
> accounts, pricing, billing with Lago and Razorpay links for India, provisioning, licences, fleet, releases, support,
> the access broker and more) on its own backend and database, and the **M84 install agent** for self-hosted installs,
> with signed pull-only commands, offboarding with a signed key-destruction certificate, tenant moves, Compose and Helm
> packaging. Left: the Owner's release review
> ([`docs/tasks/stage-2/BOARD.md`](docs/tasks/stage-2/BOARD.md)); release checklist and Owner items:
> [`docs/review/STAGE-2-RELEASE.md`](docs/review/STAGE-2-RELEASE.md).

## What you need

| Tool | Version | Notes |
|---|---|---|
| [fnm](https://github.com/Schniz/fnm) | any | Picks Node from `.nvmrc` |
| Node.js | 24 | `fnm install 24` |
| pnpm | as in `frontend/pnpm-lock.yaml` | **pnpm only.** Never `npm`, `npx` or `yarn` |
| [uv](https://docs.astral.sh/uv/) | latest | Picks Python 3.12 (`backend/pyproject.toml`). **uv only.** Never `pip` |
| Docker Compose | v2+ | Needed for real backend mode (PostgreSQL 16 + pgvector, Valkey, Keycloak, OpenBao; binds to `127.0.0.1` with `mem_limit`) |

## First-time setup

### Frontend (`frontend/`)

All frontend code lives in `frontend/` (a pnpm workspace). From the repo root:

```bash
fnm install 24
```

```bash
fnm exec --using=24 -- pnpm --dir frontend install
```

In a shell where fnm already switched to Node 24 (e.g. `cd frontend` with fnm's shell hook on), you can drop the
`fnm exec --using=24 --` prefix and run `pnpm …` from inside `frontend/`.

### Backend (`backend/`, for real-data mode)

From the repo root:

```bash
uv sync --project backend
```

To start the local dev backing services (PostgreSQL 16 + pgvector, Valkey, OpenBao dev, Keycloak dev), apply migrations
and seed the demo institutions:

```bash
uv run --project backend nexus-compose-up
uv run --project backend alembic -c backend/alembic.ini upgrade head
uv run --project backend nexus-seed
uv run --project backend nexus-keycloak-dev
```

(When running `alembic` from inside `backend/`, use `uv run alembic upgrade head`.) Stop containers when done with
`docker compose -f backend/compose.yaml down`.

## Run it

### Mock mode & UI review (no backend needed)

| What | Command (from the repo root) | Open |
|---|---|---|
| Campus app (dev server, mock data) | `fnm exec --using=24 -- pnpm --dir frontend dev` | http://127.0.0.1:3100 |
| One-command review build (PWA + offline worker) | `fnm exec --using=24 -- pnpm --dir frontend review:start` | http://localhost:4173 |
| Storybook (all UI components) | `fnm exec --using=24 -- pnpm --dir frontend storybook` | http://localhost:6006 |

Storybook's toolbar switches **light / dark** theme, a sample **tenant theme**, **locale** (English `en`, Hindi `hi`,
Tamil `ta`, pseudo-locale `en-XA`), **text direction** (LTR / RTL), the **institution type** (its terminology) and the
**viewport**. The a11y panel shows accessibility checks for each story.

Walkthrough per persona and institution type: [`docs/review/STAGE-1-WALKTHROUGH.md`](docs/review/STAGE-1-WALKTHROUGH.md).

### Real backend mode (`DATA_MODE=real`)

With the backend Compose stack running and seeded:

| What | Command (from the repo root) | Open |
|---|---|---|
| FastAPI backend (`/api/v1`, `/healthz`, `/readyz`) | `uv run --project backend nexus-dev` | http://127.0.0.1:8000 |
| Outbox & notification worker (optional) | `uv run --project backend nexus-worker` | — |
| Campus app connected to the real backend | `fnm exec --using=24 -- pnpm --dir frontend dev:real` | http://127.0.0.1:3100 |

Open `http://127.0.0.1:3100` and choose **Sign in with your institution account** (see
[`docs/review/STAGE-1-WALKTHROUGH.md`](docs/review/STAGE-1-WALKTHROUGH.md) §4b for seeded accounts and notes).

### Nexus Control (our provider app, Stage 2)

| What | Command (from the repo root) | Open |
|---|---|---|
| Control app, demo data (no backend) | `fnm exec --using=24 -- pnpm --dir frontend dev:control` | http://127.0.0.1:3200 |
| Control review build | `fnm exec --using=24 -- pnpm --dir frontend review:start:control` | http://127.0.0.1:3201 |
| Control database: migrate + seed (once) | `uv run --project backend nexus-control-db` | — |
| Staff sign-in realm with MFA (once) | `uv run --project backend nexus-keycloak-staff-dev` | — |
| Control backend | `uv run --project backend nexus-control-dev` | http://127.0.0.1:8100 |
| Control app on the real backend | `fnm exec --using=24 -- pnpm --dir frontend dev:control:real` | http://127.0.0.1:3200 |

Run the Control backend with `nexus-control-dev` (or Docker), not plain `uvicorn`: on Windows plain `uvicorn` picks an
event loop the database driver cannot use. What each page does: [`docs/guides/CONTROL-GUIDE.md`](docs/guides/CONTROL-GUIDE.md).
The install agent for self-hosted installs is `uv run --project backend nexus-agent --help`; Control's signed
commands: `uv run --project backend nexus-control-command --help`. Production installs: `deploy/compose/` (product),
`deploy/helm/nexuscampus/` (large Kubernetes sites) and `deploy/control/` (Nexus Control).

Stop any server with `Ctrl+C`.

## Check and build

### Frontend

```bash
fnm exec --using=24 -- pnpm --dir frontend review:check
```

This runs format check, lint, typecheck, all unit/integration tests (Vitest) and the production build, in that order,
and logs `[timing]` lines against the soft budgets in [`docs/TIMINGS.md`](docs/TIMINGS.md). It must pass before any
task is handed over. Single steps:

| Step | Command (inside `frontend/`, Node 24 active) |
|---|---|
| Fix formatting | `pnpm format` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| All tests | `pnpm test` |
| Tests of one package | `pnpm --filter @nexus/mocks test` |
| Production build | `pnpm build` (campus app → `apps/campus/dist`, Storybook → `packages/ui-storybook/storybook-static`) |
| Preview the built app | `pnpm --filter campus preview` |
| Playwright e2e (mock/review build) | `pnpm e2e` |
| Playwright e2e (real backend) | `pnpm e2e:real` |
| Control a11y + languages on the real stack | `pnpm e2e:control:real` |

### Backend

```bash
uv run --project backend backend-check
```

This runs `ruff format --check`, `ruff check`, `mypy` (`--strict`), and `pytest` with `[timing]` output.

## Where things are

| Path | What |
|---|---|
| `frontend/apps/campus` | The campus app (PWA for every institution role; Stage 1 modules M01–M07, M10, M11, M83; M84 Install & updates) |
| `frontend/apps/control` | Nexus Control, our provider app (P01–P18), with its own `@nexus/ui-control` package |
| `frontend/packages/ui-core`, `ui-edu` | Shared components, Campus Prism theme engine, design tokens, WCAG contrast guard |
| `frontend/packages/i18n` | Messages (`en`, `hi`, `ta`), terminology packs per institution type, formatters, pseudo-locale, RTL |
| `frontend/packages/contracts` | API types + Zod schemas |
| `frontend/packages/mocks` | Demo tenants, fixtures and the MSW mock API (`/api/v1`) |
| `frontend/packages/services` | Data layer (`mock` \| `real`): API client, query hooks, persisted L1 cache, L2 outbox writes, device heartbeat |
| `frontend/packages/offline` | IndexedDB store (Dexie), AES-GCM encryption, outbox, sync status, remote/idle wipe |
| `frontend/packages/ui-storybook` | Storybook stories and visual/a11y harness |
| `frontend/e2e` | Playwright smoke, language (`hi`, `ta`), pseudo-locale, offline, a11y and real-backend (`e2e:real`) suites |
| `backend/` | FastAPI modular monolith, SQLAlchemy 2 + Alembic migrations, PostgreSQL RLS, Valkey, Keycloak OIDC + SCIM 2.0, OpenBao Transit encryption, hash-chained audit & outbox worker, pgvector + guarded AI gateway |
| `brand.config.ts` | Platform names and logo asset paths (the only place they are written) |
| `docs/` | Requirements, plan, architecture, decisions, maps ([`STRUCTURE.md`](docs/STRUCTURE.md), [`CONTRACTS.md`](docs/CONTRACTS.md), [`COMPONENTS.md`](docs/COMPONENTS.md), [`TIMINGS.md`](docs/TIMINGS.md)) |
| `deploy/` | Production installs: `compose/` (product), `helm/` (product on Kubernetes), `control/` (Nexus Control) |
| `docs/guides/` | Living guides: [`USER-GUIDE.md`](docs/guides/USER-GUIDE.md), [`CONTROL-GUIDE.md`](docs/guides/CONTROL-GUIDE.md), [`API.md`](docs/guides/API.md), [`DATABASE.md`](docs/guides/DATABASE.md); picture manual [`docs/manual/USER-MANUAL.md`](docs/manual/USER-MANUAL.md) |

Full map: [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

## Demo data

All demo data is fictional (D16). There are five tenants: *Little Steps* (early years, India, `en-IN`), *Riverside
Education Group* with *Riverside School* on two campuses (K–12 group, UK, `en-GB` + Hindi `hi-IN`), *Northbridge
University* (higher education, US, `en-US`), *Apex Coaching* (test prep, Chennai, India, Tamil `ta-IN` + `en-IN`) and
*Harmony Music Academy* (skills academy, Singapore, `en-SG`). See `frontend/packages/mocks/src/fixtures/` and
`backend/src/nexus/seed/`.

## Working on the code

Development is done by AI agents working through task files, with the Owner approving. Read
[`AGENTS.md`](AGENTS.md) first, then [`START-HERE.md`](START-HERE.md) for the daily loop.
