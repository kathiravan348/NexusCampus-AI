# NexusCampus — Agent Rulebook

> Every agent reads this file first, every session, then its own file: `CLAUDE.md` or `GEMINI.md`.
> Keep it short: details live in `docs/`.
> NexusCampus = a global, enterprise, multi-tenant platform for every learning institution, from play school to
> university and all private institutes, with offline support and optional AI (`docs/REQUIREMENTS.md`).
> Sold as SaaS or as a self-hosted licence from one codebase; run by us through **Nexus Control**; we never access
> institution data without the institution's approval (`REQUIREMENTS.md` §9–10).
> Platform names come from `brand.config.ts` only. An institution's name, theme, fonts and texts are tenant data.

## 1. Current stage
**Stage 1 — Platform foundation, prototype step.** Frontend only: contracts, static mocks, screens. Full plan:
`docs/PLAN.md`; modules: `docs/MODULES.md`. Never build a module from a later stage.
v1 is archived at git tag `legacy-v1`: never read or copy it.

## 2. Roles (D4)
Three roles: **planner** (plans, architecture, task files), **implementer** (builds a task), **reviewer** (reviews, fixes, merges).

| Agent | May take | Default role (Owner gives none) | Own file |
|---|---|---|---|
| Gemini (Antigravity) | Planner, reviewer, implementer | Planner / reviewer (review first, then plan) | `GEMINI.md` |
| Claude (Claude Code) | Planner, reviewer, implementer | Implementer | `CLAUDE.md` |
| Owner (human) | Approves stage scope, freezes, decisions | — | — |

- The Owner may assign any role to either agent ("Plan", "Review", "Build NEX-###").
- **The builder never reviews its own task.** Claude-built → Gemini reviews; Gemini-built → Claude reviews.
- **One planner at a time.** The planner sets `Planning lock: <agent>` in the board index (`docs/tasks/BOARD.md`) before editing plan
  docs or task scope, and clears it when done.
- Only the agent acting as planner or reviewer edits `AGENTS.md`, the agent files, `docs/REQUIREMENTS.md`,
  `docs/MODULES.md`, `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` and task scope.
- An implementer never changes a plan. If a task is unclear or wrong: stop, write it under `Questions` in the task file.
- **Taking over:** set yourself as owner, read `Questions`, `Handoff` and branch commits, continue on the same branch.
  Never take over a task another agent is still working on unless the Owner says it has stopped.

## 3. Task workflow (status = lock)
Boards: `docs/tasks/BOARD.md` (index: planning lock, current stage) → `docs/tasks/stage-N/BOARD.md` (that stage's
tasks; task files `docs/tasks/stage-N/NEX-###.md`). Read the index and the current stage board every session.
`Owner` = the agent doing the current step.

`draft` (planner writing) → `planned` → `in-progress` (implementer) → `ready-for-review` → `in-review` (reviewer) → `done`

From `in-review` the reviewer may send a task back: `changes-requested` (implementer) → `ready-for-review`.

1. Change the status on the board **before** starting work, and set yourself as owner; fold board updates into the
   task/review commit rather than making separate board-only commits.
2. Never edit files of a task you do not own.
3. Two tasks whose `Files` overlap may not be `in-progress` / `in-review` at the same time. Shared list files do not
   count: `frontend/pnpm-lock.yaml` (generated; rebase, re-run `pnpm install`, never hand-edit),
   `frontend/packages/*/package.json` (dependency lines), `frontend/packages/*/src/index.ts` (export lines),
   `frontend/packages/i18n/messages/*.json` (own keys only), `frontend/apps/campus/src/app/modules.ts` (one line per
   module), `frontend/packages/mocks/src/{handlers,fixtures}/index.ts` (one line per file), `docs/STRUCTURE.md`, `docs/CONTRACTS.md`,
   `docs/COMPONENTS.md`, `docs/TIMINGS.md`, `docs/guides/*.md`. Edit only your own lines; on a conflict rebase and keep both sides.
4. One branch per task: `task/NEX-###`. **Max 3 commits per task** (D32):
   - Implementer: **1 commit** (`NEX-###: …`) with code, tests, maps/guides, handoff and `ready-for-review` (squash/amend before handoff).
   - Reviewer: **1 commit** (`review: …`) combining any fixes, the review note and `done` status in the task file + board.
   - Merge: **1 commit** on `main` (`git merge --no-ff task/NEX-###`). No separate intermediate `board:` commits.
5. Planner priority: review `ready-for-review` tasks first, then plan. Keep 2 tasks `planned` ahead.
6. The reviewer fixes small/medium issues directly; for larger problems writes exact change requests.
7. Only the reviewer merges to `main`, after all checks pass. Never push to `main` otherwise.

## 4. Token-saving rules (mandatory)
- Read only: this file, the board index, the current stage board, your task file, and the files the task lists.
  Never read boards or task files of other stages unless your task lists them.
- Planners read `REQUIREMENTS.md` / `MODULES.md` by section, never whole when one section is enough.
- Never scan or list the whole repo. Use the maps: `docs/STRUCTURE.md`, `docs/CONTRACTS.md`, `docs/COMPONENTS.md`.
- One task per session. Handoff and review notes ≤ 20 lines (`docs/templates/`).
- The reviewer reads `git diff main...task/NEX-###`, not whole files. Prove work with tests and a build.
- While working, run only the checks for the packages you touch; full `pnpm review:check` once before handing over.
- Replies report only: done / changed files / open questions.

## 5. Tech stack (do not add others without a task saying so)
Frontend: React 18, TypeScript (strict), Vite, pnpm workspaces, Tailwind CSS v4, shadcn/ui patterns (Radix where
behaviour needs it), TanStack Table, TanStack Query (+ persisted cache), React Hook Form + Zod, FormatJS
(`react-intl`, ICU), date-fns + date-fns-tz, Recharts, lucide-react, React Router, MSW, Dexie (IndexedDB),
vite-plugin-pwa (Workbox), Storybook, Vitest + Testing Library, Playwright (e2e, offline and RTL checks).
Backend (build step): Python 3.12 (Docker; host via uv), FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2 +
Alembic, PostgreSQL 16 + RLS, Redis, S3-compatible storage, OpenTelemetry; ruff, mypy `--strict`, pytest.
AI: provider-agnostic AI gateway (D14, M11) — Claude via the official `anthropic` SDK (or Bedrock/Vertex) by default,
plus pluggable providers and OpenAI-compatible local models for air-gapped/self-hosted installs; never call a model
outside the AI gateway.
Pin exact versions (`package.json` no `^`/`~`; `pyproject.toml` `==`, `uv.lock`). New dependency = handoff note +
`docs/DECISIONS.md` Requests. Never add a library that duplicates one above.

## 5a. Dev machine and tools (Owner PC, same as NOVA)
- **Node:** fnm, `.nvmrc` (24). Non-interactive shells: prefix with `fnm exec --using=24 --`.
- **JS: pnpm only** (`pnpm add -E`, `pnpm dlx`). Never `npm`, `npx`, `yarn`. **Python: uv only.** Never `pip`.
- **Docker:** ports bind to `127.0.0.1`; every service has `mem_limit`; `docker compose down` when done.
  Never touch NOVA's or Recorder's containers; never prune or change Docker/WSL settings.
- PowerShell 5.1 default: no `&&`; `package.json` scripts stay shell-neutral.

## 6. UI rules
- `apps/campus` imports UI only from `@nexus/ui-core` and `@nexus/ui-edu`; `apps/control` (Stage 2) only from
  `@nexus/ui-core` and its own `@nexus/ui-control`. `ui-core` has no domain words, no API calls.
- **No hardcoded text (D8).** Every visible string, label, aria-label, toast, error and placeholder uses a message key
  from `@nexus/i18n`. Keys: `<module>.<screen>.<element>` (e.g. `m17.roll.markAll`), `common.<element>` for shared
  actions/states, and `term.<concept>` for institution-type terminology. New keys get an `en` message and a description
  for translators.
- **Theme (D7):** colours, fonts, spacing, radius only from tokens. **Never write a hex value or font name in a
  component.** Components must look right under any theme that passes the contrast guard.
- **RTL:** use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`), never `left`/`right`.
- **Formats:** dates, numbers, money only through `@nexus/i18n` formatters with the tenant's locale/currency/time zone.
- Light and dark both work (`<html data-theme>`). Responsive from 360px; offline modules are mobile-first.
- Accessible (WCAG 2.2 AA): real `<button>`, `<a>`, `<label>`; visible focus; 4.5:1 text contrast.
- No component goes into an app until it has a Storybook story (default, loading, empty, error, disabled,
  offline/pending where relevant), checked in light, dark, pseudo-locale and RTL.
- Every screen showing mock data shows the `DemoBanner`.

## 7. Data and format rules
- All app data goes through `@nexus/services` → `@nexus/contracts`. Screens never import mock JSON.
- Contracts = TS types + Zod schemas; mocks match them (tested). Lists use the page envelope; errors `ApiError` (D15).
- Every tenant-owned record has `tenantId`. Money = integer minor units + `currency`. Times = UTC ISO-8601 (`Z`);
  calendar dates `YYYY-MM-DD`. Locales BCP 47. Phones E.164.
- Mocks are fictional and consistent: every referenced id exists, totals match rows (D16).
- **Personal data of minors and learners** is masked unless the role may see it; health, safeguarding and ID fields
  are restricted by default (REQUIREMENTS G-6).
- **Offline:** a module's screens meet its level from `docs/MODULES.md`. L2 writes go through the outbox in
  `@nexus/offline` with client ids; never write around it.
- **Delivery models (D19–D20):** every feature works in SaaS shared, SaaS dedicated and self-hosted. Anything that
  needs an outside service (AI, SMS, email, payments, maps) reads its provider and keys from tenant/install settings
  and degrades gracefully when absent. No `if customer == …` code: use config, entitlements or extensions.
- **No provider access (D22):** never build an endpoint, script, admin screen or log line that lets provider staff
  read institution data outside an approved access grant (M83/P10). Nexus Control contracts carry metadata only
  (ids, counts, versions, money) — never learner, family or staff fields.
- **AI:** screens call AI only via the Assist/AI service contracts; every AI output is labelled as AI, shows sources,
  and high-stakes suggestions need a human action to apply.

## 7a. Living guides (keep them true)
`docs/guides/`: `USER-GUIDE.md` (plain language for institution staff, families, learners), `API.md` (every
endpoint), `DATABASE.md` (every table). Update in the **same task** as the change:

| The task changes… | Update |
|---|---|
| A screen, route, menu item, user flow, role access, offline behaviour, AI feature, or known limit | `USER-GUIDE.md` |
| An endpoint (new, removed, path, input, output, errors, paging, audit action) | `API.md` |
| A table, column, constraint, RLS policy, enum value or seed row | `DATABASE.md` |

Describe only what is merged and works. Update the "State as of" line. `USER-GUIDE.md` uses the default `en` texts in
**bold** and no code names. Nothing changed → write `Guides: none` in the handoff.

## 8. Code rules
- TypeScript strict, no `any`. Named exports. One component per file. Files ≤ 300 lines.
- Tests: every component has a render test; every contract a schema test against its mock; i18n keys used in code
  exist in `en` (checked by a test).
- No secrets, keys or tokens in code, mocks, logs or commits. `.env` files are git-ignored.
- Windows: pnpm scripts, not shell-specific commands. LF line endings. Paths via `path.join`.
- Python (build step): mypy strict; Pydantic forbids extra fields; every query under the tenant's RLS context;
  every endpoint tested; every contract model has a parity test; every write audited.

## 8a. Startup & test timings (D37)
Every runnable surface and test suite reports elapsed time and warns (soft budget — never fails on slower machines)
when over budget (`docs/TIMINGS.md` holds the budgets and measured baselines):
- **Project start (all places):** dev servers (`campus`, `ui-storybook`, future `control`), `preview` / `review:start`,
  browser dev cold-boot, and future `backend/` / `control/` API + Docker Compose starts log boot-to-ready time (`[timing] ...`).
- **Tests & checks (all places):** `pnpm test` (workspace total + per-package breakdown + top-5 slowest files),
  per-package `test`, `pnpm review:check` (per step: format, lint, typecheck, test, build + total), `pnpm e2e`
  (NEX-021), and future `backend-check` / `pytest` print elapsed time and soft-budget warnings.
- **New apps, packages or services** must wire into the same timing harness (no untimed start or test entrypoints).
- **Every task handoff** records `Timings:` (from `pnpm review:check`, plus start/e2e/backend times when touched) and
  updates `docs/TIMINGS.md` when adding a surface, changing a budget, or exceeding a soft budget.

## 9. Definition of done (every task)
- [ ] Acceptance checks in the task file all pass
- [ ] `pnpm review:check` passes (format, lint, typecheck, test, build); backend: `backend-check` passes
- [ ] Stories checked at 360px and desktop, light and dark, pseudo-locale and RTL
- [ ] No hardcoded text, hex values or font names; offline level met if the task touches a module screen
- [ ] Maps updated (`STRUCTURE`, `CONTRACTS`, `COMPONENTS`) if touched; guides per §7a or `Guides: none`
- [ ] Timings recorded in handoff (§8a); `docs/TIMINGS.md` updated if a surface was added or soft budget exceeded
- [ ] Handoff note written in the task file; board status updated

## 10. Never
- Never read or copy `legacy-v1` code.
- Never use `alert()`, fake buttons, or silent fallbacks to mock data. A button works (mock or real) or is not shown.
- Never send personal data to an AI model outside the AI gateway, or with the tenant's AI switch off (D14).
- Never let AI apply a high-stakes decision without a human action.
- Never give provider staff, tools or logs a path to institution data without an approved grant (D22).
- Never fork the product for one customer; customer-specific work is an extension or configuration (D20).
- Never put keys, secrets or tokens in code, mocks, fixtures, logs or commits.
- Never change another task's files, the design tokens, or the plan without a task for it.
- Never delete tests to make a build pass.
