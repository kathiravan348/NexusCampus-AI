# Stage 1 — Platform foundation · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes run in parallel when `Files` do not overlap: **A** UI/theme/text · **B** data/offline · **C** screens.

**Step:** prototype (`docs/PLAN.md` → Stage 1) · **Modules:** M01–M07, M10, M11, M83 · **Task files:** this folder

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-001 | Monorepo setup: pnpm workspaces, Vite, TS strict, ESLint, Prettier, Vitest, empty packages, app `campus` | — | ready-for-review | Claude | — |
| NEX-002 | Theme engine: Nexus Style tokens, token pipeline, runtime tenant theme (colours, fonts, radius, density) + contrast guard | A | planned | — | 001 |
| NEX-003 | i18n engine: FormatJS, message catalogue, locale-scoped terminology packs, formatters (incl. G-3 calendars), pseudo-locale, RTL | B | planned | — | 001 |
| NEX-004 | Storybook: theme, tenant-theme, locale, RTL, viewport toggles; a11y addon | A | draft | — | 002, 003 |
| NEX-005 | ui-core port from NOVA (1/2): Button, IconButton, Badge, Card, StatCard, Skeleton, form fields — text via keys, RTL | A | draft | — | 004 |
| NEX-006 | ui-core port from NOVA (2/2): DataTable, AppShell, NavItem, Modal, Tabs, Toast, EmptyState, DemoBanner, SyncStatus | A | draft | — | 005 |
| NEX-007 | Offline package: Dexie store, outbox with idempotency keys, sync status hook, encryption, wipe | B | draft | — | 001 |
| NEX-008 | Contracts (core): ApiError, Page, DomainEvent, Group, Institution, Campus, InstitutionTypeProfile, AcademicCalendar, Locale/Region settings, Person, RoleProfile, User, Session, SsoProvider, Role, Permission | B | draft | — | 001 |
| NEX-009 | Contracts (studio & compliance): Theme, Font, TextOverride, TerminologyPack, Plan, Entitlement, AuditEvent, Consent, DataSubjectRequest, CompliancePack | B | draft | — | 008 |
| NEX-010 | Mocks: 5 demo tenants (EY, K12 under 2-campus GRP, HE, TP, SK; one Arabic), MSW handlers, empty/error/offline handlers, tests | B | draft | — | 009, 027 |
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
| NEX-021 | Review build: one-command run, walkthrough per persona and institution type, Playwright smoke/RTL/offline check, feedback checklist | — | draft | — | 013–020, 023, 024 |
| NEX-022 | Stage 1 freeze (planner + Owner): apply feedback, write Stage 1 build-step tasks | — | draft | — | 021 |
| NEX-023 | Data vault & access grants (M83): key status, provider access requests (approve / deny / revoke), active grants, break-glass notices, access history | C | draft | — | 012 |
| NEX-024 | Notifications engine (M07, core): per-locale templates, channels, preferences, quiet hours, delivery log | C | draft | — | 012 |
| NEX-025 | Forms, fields & workflow builder (M08) — moved to Stage 3 (D27); re-plan there with a new ID | — | withdrawn | — | — |
| NEX-026 | Import & migration toolkit (M09) — moved to Stage 3 (D27); re-plan there with a new ID | — | withdrawn | — | — |
| NEX-027 | Contracts (ops): NotificationTemplate, NotificationDelivery, DeviceSync, SyncConflict, AiSettings, AiCredit, AssistAnswer, KeyStatus, AccessRequest, AccessGrant, BreakGlassNotice | B | draft | — | 008 |
