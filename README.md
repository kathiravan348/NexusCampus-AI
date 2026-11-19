# NexusCampus

A multi-tenant platform for every kind of learning institution, from play schools to universities and private
institutes. It works offline, and AI features are optional. What it covers: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
Plan and stages: [`docs/PLAN.md`](docs/PLAN.md).

> **Current state: Stage 1, prototype step (frontend only).** There is no backend yet. The campus app is still a bare
> shell; the components can be seen and tried in Storybook. Screens backed by demo data arrive with tasks NEX-011 to
> NEX-024, and a one-command review build with walkthroughs comes with NEX-021
> ([`docs/tasks/stage-1/BOARD.md`](docs/tasks/stage-1/BOARD.md)).

## What you need

| Tool | Version | Notes |
|---|---|---|
| [fnm](https://github.com/Schniz/fnm) | any | Picks Node from `.nvmrc` |
| Node.js | 24 | `fnm install 24` |
| pnpm | as in `frontend/pnpm-lock.yaml` | **pnpm only.** Never `npm`, `npx` or `yarn` |

Docker and Python (uv) are needed only from the Stage 1 build step onward (backend), not yet.

## First-time setup

All frontend code lives in `frontend/` (a pnpm workspace). From the repo root:

```bash
fnm install 24
```

```bash
fnm exec --using=24 -- pnpm --dir frontend install
```

In a shell where fnm already switched to Node 24 (e.g. `cd frontend` with fnm's shell hook on), you can drop the
`fnm exec --using=24 --` prefix and run `pnpm …` from inside `frontend/`.

## Run it

| What | Command (from the repo root) | Open |
|---|---|---|
| Campus app (the PWA for every role) | `fnm exec --using=24 -- pnpm --dir frontend dev` | http://127.0.0.1:3100 |
| Storybook (all UI components) | `fnm exec --using=24 -- pnpm --dir frontend storybook` | http://localhost:6006 |

Storybook's toolbar switches **light / dark** theme, a sample **tenant theme**, **locale** (English, Arabic right to
left, pseudo-locale), the **institution type** (its terminology) and the **viewport**. The a11y panel shows
accessibility checks for each story.

Stop either server with `Ctrl+C`.

## Check and build

```bash
fnm exec --using=24 -- pnpm --dir frontend review:check
```

This runs format check, lint, typecheck, all tests (Vitest) and the production build, in that order. It must pass
before any task is handed over. Single steps:

| Step | Command (inside `frontend/`, Node 24 active) |
|---|---|
| Fix formatting | `pnpm format` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| All tests | `pnpm test` |
| Tests of one package | `pnpm --filter @nexus/mocks test` |
| Production build | `pnpm build` (campus app → `apps/campus/dist`, Storybook → `packages/ui-storybook/storybook-static`) |
| Preview the built app | `pnpm --filter campus preview` |

## Where things are

| Path | What |
|---|---|
| `frontend/apps/campus` | The campus app |
| `frontend/packages/ui-core`, `ui-edu` | Shared components, theme engine, design tokens |
| `frontend/packages/i18n` | Messages (`en`, `ar`), terminology, formatters, RTL |
| `frontend/packages/contracts` | API types + Zod schemas |
| `frontend/packages/mocks` | Demo tenants, fixtures and the MSW mock API (`/api/v1`) |
| `frontend/packages/services` | Data layer for screens: API client, query hooks, offline cache, outbox writes |
| `frontend/packages/offline` | IndexedDB store, outbox, sync status |
| `brand.config.ts` | Platform names (the only place they are written) |
| `docs/` | Requirements, plan, decisions, maps ([`STRUCTURE.md`](docs/STRUCTURE.md)), guides |

Full map: [`docs/STRUCTURE.md`](docs/STRUCTURE.md).

## Demo data

All demo data is fictional (D16). There are five tenants: *Little Steps* (early years, India), *Riverside Education
Group* with *Riverside School* on two campuses (UK), *Northbridge University* (US), *Apex Coaching* (Arabic, right to
left, UAE) and *Harmony Music Academy* (Singapore). See `frontend/packages/mocks/src/fixtures/`.

## Working on the code

Development is done by AI agents working through task files, with the Owner approving. Read
[`AGENTS.md`](AGENTS.md) first, then [`START-HERE.md`](START-HERE.md) for the daily loop.
