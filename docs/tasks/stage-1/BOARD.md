# Stage 1 — Platform foundation · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes run in parallel when `Files` do not overlap: **A** UI/theme/text · **B** data/offline · **C** screens · **D** backend / deploy.

**Step:** build — Stage 1 frozen (D43; `docs/PLAN.md` → Stage 1 step 7) · **Modules:** M01–M07, M10, M11, M83 · **Task files:** this folder

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-001 | Monorepo setup: pnpm workspaces, Vite, TS strict, ESLint, Prettier, Vitest, empty packages, app `campus` | — | done | Gemini | — |
| NEX-002 | Theme engine: Nexus Style tokens, token pipeline, runtime tenant theme (colours, fonts, radius, density) + contrast guard | A | done | Claude | 001 |
| NEX-003 | i18n engine: FormatJS, message catalogue, locale-scoped terminology packs, formatters (incl. G-3 calendars), pseudo-locale, RTL | B | done | Claude | 001 |
| NEX-004 | Storybook: theme, tenant-theme, locale, RTL, viewport toggles; a11y addon | A | done | Gemini | 002, 003 |
| NEX-005 | ui-core port from NOVA (1/2): Button, IconButton, Badge, Card, StatCard, Skeleton, form fields — text via keys, RTL | A | done | Gemini | 004 |
| NEX-006 | ui-core port from NOVA (2/2): DataTable, AppShell, NavItem, Modal, Tabs, Toast, EmptyState, DemoBanner, SyncStatus | A | done | Gemini | 005 |
| NEX-007 | Offline package: Dexie store, outbox with idempotency keys, sync status hook, encryption, wipe | B | done | Gemini | 001 |
| NEX-008 | Contracts (core): primitives (Id, dates, Locale, TimeZone, Currency, Region, InstitutionType, ModuleId), ApiError, Page, DomainEvent, LocaleSettings, Group, Institution, Campus, InstitutionTypeProfile, AcademicCalendar | B | done | Gemini | 001 |
| NEX-009 | Contracts (studio & compliance): Theme, Font, TextOverride, TerminologyPack, Plan, Entitlement, UsageMeter, AuditEvent, Consent, DataSubjectRequest, CompliancePack | B | done | Claude | 008 |
| NEX-010 | Mocks (core fixtures): 5 demo tenants (EY, K12 under 2-campus GRP, HE, TP Arabic, SK) — tenancy, calendars, people, users, roles, themes, texts, plans | B | done | Claude | 009, 028 |
| NEX-011 | Services: DATA_MODE switch, Zod validation, Query hooks, persisted cache, outbox wiring | B | done | Claude | 007, 029 |
| NEX-012 | App shell: providers, demo sign-in, persona + tenant switch, locale switch, entitlement menu, route guard, module registry | C | done | Gemini | 006, 011 |
| NEX-013 | Institution setup (M01): type profile, hierarchy, region, locale, time zone, currency, calendar | C | done | Gemini | 012 |
| NEX-014 | Theme studio (M03): token editor, fonts, logo, live preview, contrast guard errors; derive or suggest `brand-primary-text`/`on-brand` from a new `brand-primary` (NEX-002 review) | C | done | Gemini | 012 |
| NEX-015 | Text & language studio (M04): key search, per-locale overrides, in-context preview, import/export, history; validate each override with `isValidMessage` on save (NEX-003 review) | C | done | Gemini | 012 |
| NEX-016 | Users, roles & permission matrix (M02): users list, invite, roles, scopes, SSO settings screen | C | done | Claude | 012 |
| NEX-017 | Audit, privacy & consent (M06): audit viewer, consent records, data requests | C | done | Claude | 012 |
| NEX-018 | Plans & usage (M05): modules on/off, AI credits, usage meters | C | done | Claude | 012 |
| NEX-019 | Sync centre (M10): devices, pending queue, conflicts, remote wipe | C | done | Claude | 012 |
| NEX-020 | Nexus Assist (M11): Assist panel (mock answers with sources), AI settings, AI-off state | C | done | Claude | 018 |
| NEX-021 | Review build: one-command run, walkthrough per persona and institution type, Playwright smoke/RTL/offline check, feedback checklist | C | done | Claude | 013–020, 023, 024, 030, 032–036 |
| NEX-022 | Stage 1 freeze (planner + Owner): apply feedback, write Stage 1 build-step tasks | — | done | Claude (planner) | 021 |
| NEX-023 | Data vault & access grants (M83): key status, provider access requests (approve / deny / revoke), active grants, break-glass notices, access history | C | done | Claude | 012 |
| NEX-024 | Notifications engine (M07, core): per-locale templates, channels, preferences, quiet hours, delivery log | C | done | Claude | 012 |
| NEX-025 | Forms, fields & workflow builder (M08) — moved to Stage 3 (D27); re-plan there with a new ID | — | withdrawn | — | — |
| NEX-026 | Import & migration toolkit (M09) — moved to Stage 3 (D27); re-plan there with a new ID | — | withdrawn | — | — |
| NEX-027 | Contracts (ops): NotificationTemplate, NotificationDelivery, DeviceSync, SyncConflict, AiSettings, AiCredit, AssistAnswer, KeyStatus, AccessRequest, AccessGrant, BreakGlassNotice | B | done | Claude | 008 |
| NEX-028 | Contracts (identity): Person, RoleProfile, User, Session, SsoProvider, Role, Permission (split from NEX-008) | B | done | Claude | 008 |
| NEX-029 | Mocks (MSW): in-memory mock DB, read handlers for every Stage 1 resource, permission/entitlement/masking checks, scenarios (split from NEX-010) | B | done | Claude | 010, 031 |
| NEX-030 | PWA: manifest, service worker (Workbox), offline app shell, install and update prompts (split from NEX-012) | C | done | Claude | 012, 035 |
| NEX-031 | Mocks (ops fixtures): audit, consent, data requests, compliance packs, notifications, sync, AI, vault (split from NEX-010) | B | done | Claude | 010, 027 |
| NEX-032 | Startup & test timings: timing harness, Vitest reporter, soft budgets, and baseline log (`AGENTS.md` §8a, D37) | C | done | Claude | 012 |
| NEX-033 | Campus Prism default theme tokens (Nexus Style refresh, D38) | A | done | Gemini | 002, 014 |
| NEX-034 | Freeze Campus Prism palette: radius-xs 4px, border-strong fix, `brand-sky`, `hero-glow`, full freeze test (D39) | A | done | Claude | 033 |
| NEX-035 | NexusCampus logo assets: mark, lockups, favicons, PWA icons in `public/brand/` (D40) | A | done | Claude | 034 |
| NEX-036 | NexusCampus logo in the app header and sign-in page (mark + name) | C | done | Claude | 035 |
| NEX-037 | Logo image corrections: SVG master, exact gradient, clean dark lockup, no baked tagline, small favicon, mono (waits for designer files) | A | done | Claude | 036 |
| NEX-038 | PWA + MSW share one service worker in mock builds (fix for NEX-030, found by NEX-021) | C | done | Claude | 030 |
| NEX-039 | Home page: intro line and a short description on every module tile (Owner request) | C | done | Claude | 012 |
| NEX-040 | Default languages English, Hindi, Tamil; Arabic removed (D42, Owner decision) | B | done | Claude | 003, 010, 021 |
| NEX-041 | L1 screens show "Last synced" (fix from Stage 1 review) | C | done | Claude | 021 |
| NEX-042 | Backend skeleton: FastAPI, uv, backend-check, timings, OpenTelemetry, Compose (PostgreSQL 16 + pgvector, Redis) | D | done | Claude | 022 |
| NEX-043 | Region config, tenancy schema with RLS, Alembic baseline, demo seed | D | done | Claude | 042 |
| NEX-044 | Audit core: append-only hash-chained writer + domain event outbox | D | done | Claude | 043 |
| NEX-045 | Identity: Keycloak, OIDC sign-in, server sessions, /me (D44) | D | done | Claude | 044 |
| NEX-046 | RBAC + entitlement guard: permission catalogue, scoped assignments, module switch | D | done | Claude | 045 |
| NEX-047 | Tenancy API (M01) | D | done | Claude | 046 |
| NEX-048 | Users & access API (M02): people, users, invite, roles, sessions | D | done | Claude | 047 |
| NEX-049 | SSO providers + SCIM 2.0 (M02) | D | done | Claude | 048 |
| NEX-050 | Vault (D46): per-tenant keys, field encryption, key status API (M83) | D | done | Claude | 046 |
| NEX-051 | Provider access (M83): requests, time-boxed grants, break-glass notices | D | done | Claude | 050 |
| NEX-052 | Audit & privacy API (M06): audit log + chain check, consents, DSR, packs | D | done | Claude | 046 |
| NEX-053 | Theme + fonts API (M03) with server-side contrast guard | D | done | Claude | 046 |
| NEX-054 | Texts API (M04): overrides, revisions, import/export, bundles | D | done | Claude | 046 |
| NEX-055 | Plan, entitlements and usage API (M05) | D | done | Claude | 046 |
| NEX-056 | Notifications engine (M07): templates, preferences, outbox worker, delivery log | D | done | Claude | 046 |
| NEX-057 | Sync API (M10): idempotent replay, devices, conflicts, remote wipe | D | done | Claude | 046 |
| NEX-058 | AI gateway (M11): tiers, Claude adapter, guarded pipeline, pgvector retrieval, credits | D | done | Claude | 052, 055 |
| NEX-059 | Contract parity tests: Pydantic ↔ Zod | D | done | Claude | 047–058 |
| NEX-060 | Switch to real data 1: dev proxy, sign-in, shell, M01, M02 | C | planned | — | 049, 059 |
| NEX-061 | Switch to real data 2: M03, M04, M05 | C | planned | — | 060 |
| NEX-062 | Switch to real data 3: M06, M07, M10 | C | planned | — | 061 |
| NEX-063 | Switch to real data 4: M11, M83 | C | planned | — | 062 |
| NEX-064 | Images + self-hosted Compose install | D | planned | — | 063 |
| NEX-065 | Harden Stage 1: no-access tests (V-1…V-7), signed audit checkpoints, i18n, a11y, performance | D | planned | — | 064 |
