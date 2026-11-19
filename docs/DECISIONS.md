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
| D14 | 2026-11-19 | AI only through the AI gateway: per-tenant switch, credits, PII redaction, user's own permissions, region-pinned Claude models, evaluations, human-in-the-loop for high-stakes (provider choice extended by D24) | Owner: more AI across modules, safely (EU AI Act) |
| D15 | 2026-11-19 | Pagination envelope `{ items, total, page, pageSize }` and `ApiError` from the first contract; contracts versioned | Avoid NOVA's later paging retrofit |
| D16 | 2026-11-19 | Demo data: 5 fictional tenants (EY, K12, HE, TP, SK), one in Arabic (RTL); consistent ids; no real personal data | Prove every type and RTL from day one |
| D17 | 2026-11-19 | Web first as an installable PWA; branded native apps wrap the PWA in Stage 7 | One codebase; offline works in the PWA |
| D18 | 2026-11-19 | 7 stages (replaces D3's limit of 5): Foundation → Nexus Control & delivery → Core operations → Teaching & learning → People, finance & ops → Campus life → Enterprise & ecosystem. More stages may be added; IDs never change | Owner: stages may grow; Control needed before first customer |
| D19 | 2026-11-19 | Two ways to buy, one product: SaaS (shared or dedicated cell, subscription) and self-hosted (licence + support/update contract, Compose or Helm, air-gapped option); hybrid with Edge node | Owner: small institutes subscribe, security-focused institutes buy and host |
| D20 | 2026-11-19 | One codebase and release train for all models; customer-specific work only as extensions/config, never forks | We can maintain every deployment and ship updates to all |
| D21 | 2026-11-19 | Nexus Control = separate provider platform (own app, backend, database, staff identity); stores only commercial/technical metadata | Run subscribers and licences without holding institution data |
| D22 | 2026-11-19 | Zero standing access: per-tenant keys in a vault (BYOK/HYOK for dedicated/self-hosted); provider access only via institution-approved, scoped, time-boxed, audited grants; break-glass with two approvers + notice; self-hosted has no inbound path | Owner: no data access without the institution's permission |
| D23 | 2026-11-19 | Self-hosted licences are signed files verified offline by the install agent; expiry → grace → read-only, never data loss | Works air-gapped; customers never lose data over billing |
| D24 | 2026-11-19 | Provider-agnostic AI gateway with capability tiers (`fast`, `balanced`, `reasoning`, `embedding`, `multimodal`), extending D14: Claude default (`anthropic` SDK / Bedrock / Vertex), pluggable adapters incl. Gemini and local OpenAI-compatible LLMs (vLLM/Ollama) for self-hosted/air-gapped, built only when a customer needs one and after its own evaluation runs; hard block on health and vault data, safeguarding AI opt-in only, minor guardian consent check | Supports G-5 regional pinning, air-gapped installs (DM-3), multimodal workloads, and minor-privacy laws (DPDP/COPPA/GDPR-K) |
| D25 | 2026-11-19 | Core domain data models: separate `Person` from `RoleProfile` memberships; temporal scoping (`academic_year_id`, `effective_from`/`to`); append-only hash-chained audit (hash over ids, metadata and encrypted payload, so erasure keeps the chain valid); 3-state retention lifecycle (`active`/`archived`/`crypto-shredded`); standard domain event envelope | Avoids duplicate accounts for staff-parents, preserves academic history for rollover (M86), and satisfies tamper-evident audit (E-3) & retention vs. erasure (G-6) |
| D26 | 2026-11-19 | Added modules M85–M91 (emergency/crisis L3, year rollover, scholarships/aid, archive & statutory returns, labs/workshops, governance/policies, consent-aware portfolios) and P17–P18 (sandboxes/staging, tenant portability/migrations) | End-to-end audit closed critical gaps across safety, regulatory returns, VOC/HE labs, EY/SK portfolios, and SaaS ⇄ self-hosted portability |
| D27 | 2026-11-19 | Stage 1 prototype covers every Stage 1 module: M07 (Notifications, core) added as NEX-024. M08 (forms/fields/workflows) and M09 (import/migration) move to Stage 3, where there are records to customise and import (NEX-025/026 withdrawn). Contracts split into NEX-009 (studio & compliance) and NEX-027 (ops). Demo mocks wrap Riverside School inside a 2-campus Group (GRP) | Closes the module-to-task gap while keeping Stage 1 lean; makes group hierarchy, theme locks (C-1) and text inheritance (C-2) testable in Stage 1 |
| D28 | 2026-11-19 | Theme engine adds `density` token + dual WCAG 2.2 contrast thresholds (4.5:1 text / 3:1 UI & focus); i18n terminology packs are locale-scoped across all 8 types (incl. `grp`) and `formatDate` supports G-3 secondary calendars | Prevents English terminology packs from overwriting Arabic/non-English locales and completes C-1/G-3/G-8 |

## Open (decide by the Stage 1 freeze)
- Identity: own implementation vs. Keycloak / Zitadel for SSO, SCIM and passkeys.
- Hosting provider and the first two data regions.
- Search engine (PostgreSQL full-text first vs. OpenSearch/Meilisearch).
- Vector store for tenant-isolated RAG/embeddings (`pgvector` in PostgreSQL 16 with RLS vs. dedicated store).
- Native wrapper for Stage 7 apps (Capacitor vs. React Native shell).
- Vault / key management: HashiCorp Vault (works for self-hosted too) vs. cloud KMS per provider.
- Billing engine for Nexus Control: build on Stripe Billing, Chargebee or open-source Lago (regional tax and gateways).
- Licence pricing unit for self-hosted: per learner, per campus, or flat edition.

## Requests
_(implementers note new dependencies or decision requests here; the planner moves them into the table)_
- NEX-002 (Claude): `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` (stack, AGENTS §5); self-hosted fonts `@fontsource/inter@5.3.0`, `@fontsource/noto-sans-arabic@5.3.0`, `@fontsource/jetbrains-mono@5.3.0` (the NEX-002 font library; no font CDN). `border-strong` changed from NOVA's values to `#878F9C` / `#5E6E8A` so input borders meet WCAG 2.2 SC 1.4.11 (3:1).
- NEX-003 (Claude): `react-intl@12.2.0` (FormatJS, in the stack, AGENTS §5; supports React 18). `date-fns`/`date-fns-tz` not added: `Intl` covers every formatter in the task. Review added `@formatjs/icu-messageformat-parser@3.5.23` (the version react-intl already uses) to reject invalid ICU overrides.
