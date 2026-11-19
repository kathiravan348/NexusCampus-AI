# NexusCampus — Plan (7 stages)

> What to build and in which order. Requirements: `docs/REQUIREMENTS.md`. Modules per stage: `docs/MODULES.md`.
> Stages may be added later (D18); module and task IDs never change.

## Stages
| Stage | Name | Modules | Exit: what is true after it |
|---|---|---|---|
| **1** | **Platform foundation** | M01–M07, M10, M11, M83 | Any institution type can be set up in any locale with its own theme, fonts and texts; users, roles, SSO, audit, entitlements, notifications, offline kit, AI gateway and the data vault with institution-approved access grants work for real |
| 2 | Nexus Control & delivery | P01–P18, M84 | We can sell and run both models: SaaS subscribers (provision, bill, meter, sandboxes, support) and self-hosted licence customers (licence, install, update, extensions, portability, support) — without access to their data |
| 3 | Core institution operations | M08, M09, M12–M28, M86 | A play school, a school, a college, a coaching centre and a skill institute import their data, add custom fields and approval workflows, and run admissions → records → timetable → attendance → fees → assessment → reports → communication → portals → year-end rollover |
| 4 | Teaching & learning | M29–M46, M91 | Curriculum, LMS, content, homework, tests, AI tutor, early years, portfolios, library, test prep, courses, higher-ed credits, credentials, early warning |
| 5 | People, finance & operations | M47–M51, M57–M59, M63, M71, M72, M87–M90 | HR, payroll, staff attendance, appraisal, cover, inventory, procurement, facilities, labs/workshops, service desk, scholarships/aid, statutory returns & archive, governance/policies, research, accreditation |
| 6 | Campus life & services | M52–M56, M60–M62, M64–M70, M85 | Transport, hostel, canteen, store, wallet, gate, emergency & crisis (L3), health, wellbeing, events, sports, trips, placement, internships, international, alumni |
| 7 | Enterprise & ecosystem | M73–M82 | Groups/franchises, BI, integrations and public API, marketplace, white-label apps, website builder, Edge node, IoT, ESG, trust centre; certifications |

**Current: Stage 1.** Do not build modules of a later stage.
Why Control is Stage 2: the first paying customer (SaaS or self-hosted) needs provisioning, billing or licensing,
updates and support before any school module ships to them.

## How every stage runs (same loop, NOVA style)
1. **Design** — planner writes the stage's contracts and task files; Owner approves the module list.
2. **Prototype** — contracts + mocks + screens (frontend only). Owner reviews a clickable build per persona,
   institution type and delivery model.
3. **Freeze** — feedback applied; screens and contracts frozen for the stage (decision entry).
4. **Build** — backend behind the frozen contracts; screens switched from mock to real one at a time.
5. **Harden & release** — offline tests (per module level), i18n (pseudo-locale + RTL), WCAG 2.2 AA, security review,
   no-access checks (V-1…V-7), install test on Compose and Helm, performance budget, AI evaluations; guides updated.

AI features are built **inside** the stage of their module (behind the per-tenant switch), not as a later add-on.
Offline levels and the self-hosted install are part of each module's acceptance from Stage 3 on.

## Stage 1 — Platform foundation (detail)
| Step | Tasks | What exists after |
|---|---|---|
| 1. Repo | 001 monorepo · 002 theme engine · 003 i18n engine · 004 Storybook | Tooling, tokens, text system, Storybook with theme/locale/RTL toggles |
| 2. UI library | 005 ui-core basics + forms · 006 ui-core data table, shell, overlays | Components, all text via keys, RTL-safe |
| 3. Offline kit | 007 offline package (store, outbox, sync status) | L1/L2 building blocks with tests |
| 4. Data layer | 008 contracts: platform core + tenancy + calendar · 028 contracts: identity (Person/RoleProfile, User, Session/SSO, roles) · 009 contracts: studio, entitlements, audit/compliance · 027 contracts: notifications, sync, AI, vault & grants · 010 mock fixtures (5 demo tenants, incl. 2-campus Group & Arabic RTL) · 031 ops fixtures · 029 MSW handlers · 011 services (offline-aware) | Demo tenants served through MSW |
| 5. Screens | 012 app shell · 030 PWA · 013 institution setup · 014 theme studio · 015 text & language studio · 016 users, roles, permissions · 017 audit + consent · 018 plans & usage · 019 sync centre · 020 Assist + AI settings · 023 data vault & access grants · 024 notifications engine | All Stage 1 screens clickable |
| 6. Review | 032 startup & test timings · 021 review build + walkthrough + Playwright smoke/RTL/offline check · 022 freeze | Measured start/test timings, frozen Stage 1 scope |
| 7. Build | backend skeleton, region config, RLS schema, vault + per-tenant keys, identity + SSO, tenancy, theme + text services, entitlements, audit (hash-chained), notifications, sync API, provider-agnostic AI gateway — task files written at freeze | Stage 1 real, packaged as images that run in a SaaS cell and as a self-hosted Compose install |

Demo tenants (mock and seed): *Little Steps* (EY), *Riverside School* (K12, under 2-campus *Riverside Education Group*, GRP),
*Northbridge University* (HE), *Apex Coaching* (TP), *Harmony Music Academy* (SK). All fictional; one uses an RTL locale
(Arabic) for testing; the Group exercises inherited/locked themes and text overrides.

## Stage 2 — Nexus Control & delivery (outline; detail at Stage 1 freeze)
Prototype `apps/control`: accounts → plans and quotes → SaaS provisioning → billing and metering → licence files →
fleet registry → releases and channels → extensions → sandboxes/staging (P17) → tenant portability/migrations (P18) →
support desk → access broker (with the M83 approval loop in the institution app) → partners → analytics. Build: control
backend (own DB, own staff SSO), signing service for licences and releases, M84 install agent, Compose + Helm packaging,
air-gapped bundle, tenant export/import (DM-8).
