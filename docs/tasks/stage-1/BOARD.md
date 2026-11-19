# Stage 1 — Platform foundation · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes run in parallel when `Files` do not overlap: **A** UI/theme/text · **B** data/offline · **C** screens.

**Step:** prototype (`docs/PLAN.md` → Stage 1) · **Modules:** M01–M11, M83 · **Task files:** this folder

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-001 | Monorepo setup: pnpm workspaces, Vite, TS strict, ESLint, Prettier, Vitest, empty packages, app `campus` | — | planned | — | — |
| NEX-002 | Theme engine: Nexus Style tokens, token pipeline, runtime tenant theme (colours, fonts, radius) + contrast guard | A | planned | — | 001 |
| NEX-003 | i18n engine: FormatJS, message catalogue, layered overrides, terminology packs, formatters, pseudo-locale, RTL | B | planned | — | 001 |
| NEX-004 | Storybook: theme, tenant-theme, locale, RTL, viewport toggles; a11y addon | A | draft | — | 002, 003 |
| NEX-005 | ui-core port from NOVA (1/2): Button, IconButton, Badge, Card, StatCard, Skeleton, form fields — text via keys, RTL | A | draft | — | 004 |
| NEX-006 | ui-core port from NOVA (2/2): DataTable, AppShell, NavItem, Modal, Tabs, Toast, EmptyState, DemoBanner, SyncStatus | A | draft | — | 005 |
| NEX-007 | Offline package: Dexie store, outbox with idempotency keys, sync status hook, encryption, wipe | B | draft | — | 001 |
| NEX-008 | Contracts (core): ApiError, Page, Group, Institution, Campus, InstitutionTypeProfile, Locale/Region settings, User, Role, Permission | B | draft | — | 001 |
| NEX-009 | Contracts (studio): Theme, Font, TextOverride, TerminologyPack, Plan, Entitlement, AuditEvent, Consent, AiSettings, AiCredit, KeyStatus, AccessRequest, AccessGrant | B | draft | — | 008 |
| NEX-010 | Mocks: 5 demo tenants (EY, K12, HE, TP, SK; one Arabic), MSW handlers, empty/error/offline handlers, tests | B | draft | — | 009 |
| NEX-011 | Services: DATA_MODE switch, Zod validation, Query hooks, persisted cache, outbox wiring | B | draft | — | 007, 010 |
| NEX-012 | App shell: sign-in, persona + tenant switch, locale switch, entitlement menu, route guard, PWA install | C | draft | — | 006, 011 |
| NEX-013 | Institution setup (M01): type profile, hierarchy, region, locale, time zone, currency, calendar | C | draft | — | 012 |
| NEX-014 | Theme studio (M03): token editor, fonts, logo, live preview, contrast guard errors | C | draft | — | 012 |
| NEX-015 | Text & language studio (M04): key search, per-locale overrides, in-context preview, import/export, history | C | draft | — | 012 |
| NEX-016 | Users, roles & permission matrix (M02): users list, invite, roles, scopes, SSO settings screen | C | draft | — | 012 |
| NEX-017 | Audit, privacy & consent (M06): audit viewer, consent records, data requests | C | draft | — | 012 |
| NEX-018 | Plans & usage (M05): modules on/off, AI credits, usage meters | C | draft | — | 012 |
| NEX-019 | Sync centre (M10): devices, pending queue, conflicts, remote wipe | C | draft | — | 012 |
| NEX-020 | Nexus Assist (M11): Assist panel (mock answers with sources), AI settings, AI-off state | C | draft | — | 018 |
| NEX-021 | Review build: one-command run, walkthrough per persona and institution type, feedback checklist | — | draft | — | 013–020, 023 |
| NEX-022 | Stage 1 freeze (planner + Owner): apply feedback, write Stage 1 build-step tasks | — | draft | — | 021 |
| NEX-023 | Data vault & access grants (M83): key status, provider access requests (approve / deny / revoke), active grants, access history | C | draft | — | 012 |
