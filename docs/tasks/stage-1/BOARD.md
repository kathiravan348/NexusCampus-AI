# Stage 1 — Platform foundation · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes run in parallel when `Files` do not overlap: **A** UI/theme/text · **B** data/offline · **C** screens.

**Step:** prototype (`docs/PLAN.md` → Stage 1) · **Modules:** M01–M07, M10, M11, M83 · **Task files:** this folder

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
| NEX-021 | Review build: one-command run, walkthrough per persona and institution type, Playwright smoke/RTL/offline check, feedback checklist | — | planned | — | 013–020, 023, 024, 030, 032–036 |
| NEX-022 | Stage 1 freeze (planner + Owner): apply feedback, write Stage 1 build-step tasks | — | planned | — | 021 |
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
