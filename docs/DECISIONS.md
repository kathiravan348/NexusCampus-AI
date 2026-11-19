# NexusCampus — Decisions log

> Newest last. One short entry per decision. The agent acting as planner or reviewer, or the Owner, adds entries.

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-11-19 | Fresh start. v1 kept only at git tag `legacy-v1`; its requirements and architecture are not used | Owner: rebuild requirements from the current vision |
| D2 | 2026-11-19 | Product scope: every learning institution type (EY, K12, HE, VOC, TP, SK, ONL, GRP) in one product, configured by type profile | Owner goal: play school to university and all private institutes |
| D3 | 2026-11-19 | Delivery in 5 stages (Platform → Core operations → Teaching & learning → Campus ops & people → Enterprise & ecosystem); each stage runs design → prototype → freeze → build → harden (stage count superseded by D18) | NOVA loop proved itself |
| D4 | 2026-11-19 | Both agents may plan, review and build. Defaults: Gemini (Antigravity) plans and reviews, Claude (Claude Code) builds. The builder never reviews its own task; one planner at a time (planning lock on the board) | Owner request; cross-review keeps quality |
| D5 | 2026-11-19 | Frontend monorepo: pnpm workspaces; packages `ui-core`, `ui-edu`, `i18n`, `offline`, `contracts`, `services`, `mocks`, `ui-storybook`; one PWA app `campus`. Task IDs `NEX-###` | Same proven tooling as NOVA |
| D6 | 2026-11-19 | `ui-core` and its token pipeline start from NOVA's source (port, rename to `@nexus/*`) | Tested, accessible, token-only components |
| D7 | 2026-11-19 | Institutions control the full theme: all colour tokens (light/dark), fonts, radius, density, assets; a contrast guard blocks anything below WCAG AA; groups may lock tokens | Owner: institute controls theme and fonts, accessibility kept |
| D8 | 2026-11-19 | Every static text is a message key (ICU MessageFormat via FormatJS `react-intl`); layers: platform → terminology pack → group → institution → campus, per locale | Owner: institute controls all static texts; global languages |
| D9 | 2026-11-19 | Global by design: BCP 47 locales, RTL, ISO 4217 money in minor units, UTC + tenant time zone, configurable calendars and grading, region compliance packs | Owner: global support |
| D10 | 2026-11-19 | Regional cells: one identical stack per data region; a global control plane only knows tenant → region | Data residency and enterprise customers |
| D11 | 2026-11-19 | One PostgreSQL per region cell with Row-Level Security by `tenant_id` (no database per tenant) | Simpler migrations and pooling at 10k tenants |
| D12 | 2026-11-19 | Backend: modular monolith (Python 3.12, FastAPI); modules talk only via core interfaces or domain events | Enterprise boundaries without microservice cost |
| D13 | 2026-11-19 | Offline levels L0–L3 per module; PWA + IndexedDB (Dexie) + outbox sync with idempotency keys; Edge node in Stage 7 | Owner: offline where possible |
| D14 | 2026-11-19 | AI only through the AI gateway: per-tenant switch, credits, PII redaction, user's own permissions, region-pinned Claude models, evaluations, human-in-the-loop for high-stakes | Owner: more AI across modules, safely (EU AI Act) |
| D15 | 2026-11-19 | Pagination envelope `{ items, total, page, pageSize }` and `ApiError` from the first contract; contracts versioned | Avoid NOVA's later paging retrofit |
| D16 | 2026-11-19 | Demo data: 5 fictional tenants (EY, K12, HE, TP, SK), one in Arabic (RTL); consistent ids; no real personal data | Prove every type and RTL from day one |
| D17 | 2026-11-19 | Web first as an installable PWA; branded native apps wrap the PWA in Stage 7 | One codebase; offline works in the PWA |
| D18 | 2026-11-19 | 7 stages (replaces D3's limit of 5): Foundation → Nexus Control & delivery → Core operations → Teaching & learning → People, finance & ops → Campus life → Enterprise & ecosystem. More stages may be added; IDs never change | Owner: stages may grow; Control needed before first customer |
| D19 | 2026-11-19 | Two ways to buy, one product: SaaS (shared or dedicated cell, subscription) and self-hosted (licence + support/update contract, Compose or Helm, air-gapped option); hybrid with Edge node | Owner: small institutes subscribe, security-focused institutes buy and host |
| D20 | 2026-11-19 | One codebase and release train for all models; customer-specific work only as extensions/config, never forks | We can maintain every deployment and ship updates to all |
| D21 | 2026-11-19 | Nexus Control = separate provider platform (own app, backend, database, staff identity); stores only commercial/technical metadata | Run subscribers and licences without holding institution data |
| D22 | 2026-11-19 | Zero standing access: per-tenant keys in a vault (BYOK/HYOK for dedicated/self-hosted); provider access only via institution-approved, scoped, time-boxed, audited grants; break-glass with two approvers + notice; self-hosted has no inbound path | Owner: no data access without the institution's permission |
| D23 | 2026-11-19 | Self-hosted licences are signed files verified offline by the install agent; expiry → grace → read-only, never data loss | Works air-gapped; customers never lose data over billing |

## Open (decide by the Stage 1 freeze)
- Identity: own implementation vs. Keycloak / Zitadel for SSO, SCIM and passkeys.
- Hosting provider and the first two data regions.
- Search engine (PostgreSQL full-text first vs. OpenSearch/Meilisearch).
- Native wrapper for Stage 7 apps (Capacitor vs. React Native shell).
- Vault / key management: HashiCorp Vault (works for self-hosted too) vs. cloud KMS per provider.
- Billing engine for Nexus Control: build on Stripe Billing, Chargebee or open-source Lago (regional tax and gateways).
- Licence pricing unit for self-hosted: per learner, per campus, or flat edition.

## Requests
_(implementers note new dependencies or decision requests here; the planner moves them into the table)_
