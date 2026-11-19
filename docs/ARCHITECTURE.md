# NexusCampus — Architecture

> Target architecture for all stages (`docs/PLAN.md`). Requirements it serves: `docs/REQUIREMENTS.md`. Decisions: `docs/DECISIONS.md`.

## 1. Big picture
```
Clients ── PWA web app (staff, admin, family, learner) · white-label mobile apps (Stage 7) · public API / LTI
   │        └─ offline kit: service worker + IndexedDB store + sync outbox (L1–L3)
   ▼
Region cell (one per data region: IN, EU, US, ME, APAC…) — identical stack, data never leaves its region
   ├─ API gateway: auth, tenant resolution, rate limits, API versions
   ├─ App (modular monolith, FastAPI): core + one package per module (M01…M91)
   ├─ Workers: jobs, notifications, sync merges, reports, imports
   ├─ AI gateway (M11): redaction, capability-tier routing, metering, evaluations → Claude (default/Bedrock/Vertex), pluggable cloud or local OpenAI-compatible LLM (air-gapped)
   ├─ PostgreSQL 16 (Row-Level Security by tenant) · Redis · object storage (S3-compatible) · search
   └─ Telemetry: OpenTelemetry → logs, metrics, traces
Nexus Control (provider platform, §9) — customers, plans, billing, licences, tenant directory (which region),
   fleet registry, releases, support access broker. Separate app, database and staff identity. No institution data.
Self-hosted install (§9) — the same product images on the customer's servers; talks to Nexus Control only outbound
   (licence, updates, PII-free telemetry) or not at all (air-gapped bundles)
Edge node (Stage 7) — on-campus server running the offline-capable modules, syncing to its region cell or install
```

## 2. Frontend
```
apps/campus           one PWA; routes, menu and screens depend on role, entitlements and institution type
packages/ui-core      generic components + theme engine (no domain words, no API)
packages/ui-edu       education components (LearnerCard, AttendanceRoll, GradeGrid, FeeStatus…) on ui-core
packages/i18n         message catalogue, ICU formatting, layered text overrides, RTL, locale formats
packages/offline      service worker setup, IndexedDB store, outbox, sync status, conflict UI hooks
packages/contracts    TypeScript types + Zod schemas (wire format, versioned)
packages/services     fetch + TanStack Query hooks; validates every response; offline-aware (persisted cache, outbox)
packages/mocks        demo tenants (EY, K12, HE, TP, SK) + MSW handlers
packages/ui-storybook Storybook: theme, locale, RTL, viewport and offline toggles
apps/control          Nexus Control (provider platform, Stage 2) — same ui-core, own routes, own contracts area
```
- `VITE_DATA_MODE=mock|real`: one code path. Errors are `ApiError`; lists use the page envelope.
- **No hardcoded text.** Components get text through message keys (`packages/i18n`), never string literals.
- **Layout is direction-neutral:** CSS logical properties (`ms-*`, `pe-*`), icons mirrored where meaningful.

## 3. Theming (C-1)
- Tokens (`tokens.json`) → CSS variables + Tailwind theme. Components use tokens only.
- An institution theme = a partial token set for light and dark + font choices + radius + density
  (`compact` / `comfortable` / `spacious`) + assets, stored per tenant and applied at runtime by setting CSS
  variables on `<html>`. Fonts load from the font library or tenant uploads.
- Contrast guard checks every defined pair (WCAG 2.2 AA: ≥ 4.5:1 normal text, ≥ 3:1 large text, icons, focus rings
  and UI borders) before a theme can be saved. Respects `prefers-reduced-motion`.
- Inheritance: platform default → group → institution → campus; groups may lock tokens.

## 4. Texts and languages (C-2, G-1)
- Every string = message key + ICU message in the platform catalogue (`en` source; translations as language packs).
- Terminology packs are **locale-scoped** (`terminology/<locale>/<type>`), so an English pack never overwrites another
  language. Resolution order: institution/campus override → group override → locale terminology pack → platform
  translation → `en` terminology pack → platform `en`. Missing keys fall back and are reported, never shown as raw keys.
- Overrides are tenant data (versioned, audited), served as a compiled bundle per tenant + locale, cached offline.
- Checks: pseudo-locale (long + accented) and an RTL locale run in tests and Storybook.

## 5. Offline (O)
- **L1:** persisted query cache in IndexedDB; screens show "last synced".
- **L2:** writes go to an **outbox** with client-generated ids and idempotency keys; replayed on reconnect;
  server is the authority; each module declares its merge rule (`LWW-audited`, `append-only`, or `manual-review-only`
  — e.g. attendance: last mark per learner per session wins with audit; payments/grades/custody: flagged as conflict).
- **L3:** the module's needed reference data is pre-synced to the device or Edge node; Edge node exposes the same API
  locally and syncs to the region cell through the same outbox protocol. Priority sync sends safety/gate/attendance
  before media uploads.
- Device encryption uses WebCrypto (`AES-GCM`) with a per-user, non-extractable `CryptoKey` stored in IndexedDB, so
  offline data survives app and phone restarts; shared campus devices support quick user switching with idle lock/PIN.
  Sign-out is refused while the outbox holds unsynced writes (the user is asked to sync first); sign-out then deletes
  the key and wipes that user's data. A remote revoke (`M10`) wipes immediately and reports any lost writes in M10.

## 6. Backend
- **Modular monolith (Python, FastAPI).** One package per module with its own router, models, migrations folder and
  events. Modules talk to each other only through the core's public interfaces or a standard domain event envelope
  (`eventId`, `tenantId`, `moduleId`, `eventType`, `occurredAt`, `actorId`, `correlationId`, `schemaVersion`, `payload`)
  via the outbox table → workers. No module imports another optional module.
- **Core domain models (D25):**
  - *Person vs. Membership:* one `Person` (identity, contact, consents) links to one or more `RoleProfile` memberships
    (staff, guardian, learner, alumni) so a teacher who is also a parent never needs duplicate accounts.
  - *Temporal scoping:* enrollments, role scopes, fee plans and grading schemes carry `academic_year_id` /
    `effective_from`–`effective_to` so historical views and year-end rollovers (M86) stay exact.
  - *Retention lifecycle:* records move `active` → `archived` (immutable) → `anonymised / crypto-shredded`, honouring
    legal holds and statutory retention rules (retention engine in M06; statutory archive in M88; G-6).
- **Tenancy:** every tenant table has `tenant_id`; RLS policy on `current_setting('app.tenant_id')`, set per request
  from the signed session — never from a client header. Group/campus scoping in the permission layer.
- **Entitlements:** each request checks the module switch; disabled → `module_disabled` error and hidden in the menu.
- **Audit:** every write (and sensitive read) emits an audit event in the same transaction into an append-only table
  (`REVOKE UPDATE, DELETE`) with a per-tenant hash chain (`prev_hash`, `entry_hash`) and periodic signed checkpoints.
  The hash covers ids, metadata and the **encrypted** payload only, so crypto-shredding personal data never breaks the
  chain or its verification.
- **Config over code:** custom fields (JSONB with schema), workflows, templates, numbering — all tenant data.
- **Extensibility:** extension SDK basics in Stage 2 (P08, per-customer extensions); public API, webhooks and marketplace in Stage 7. Extensions never patch core code.

## 7. AI (A)
- All AI goes through the **AI gateway**; no module calls a model directly.
- **Provider-agnostic capability tiers (D24):** features request a tier (`fast`, `balanced`, `reasoning`, `embedding`,
  `multimodal`) rather than a vendor model id. Default SaaS provider is Claude (`anthropic` SDK, AWS Bedrock, or
  Google Vertex AI for regional pinning G-5), with pluggable adapters for Gemini, Azure OpenAI, and OpenAI-compatible
  local endpoints (vLLM / Ollama) for self-hosted and air-gapped installs. **Build order:** the provider interface and
  the Claude adapter first; each other adapter is added only when a customer needs it, and only after it passes the
  same evaluation and safety runs (A-8).
- Pipeline: entitlement + credit check → minor-consent & sensitive-field guard (blocks M61 health, M62 safeguarding,
  M83 vault/keys) → build context from API calls made **as the user** (plus tenant-isolated vector retrieval) →
  PII redaction → routed model call → restore names → cite sources → log + meter.
- Agent actions (*Act*) are proposed as a plan the user confirms; each step runs through normal APIs and audit.
- High-stakes features (A-4) store the suggestion, the reasons and the human decision.
- Every feature has an evaluation set in the repo and a kill switch per tenant and globally.

## 8. Security & operations
- SSO (SAML/OIDC), SCIM, MFA, passkeys; sessions in secure cookies for web, tokens for apps and API.
- Secrets in a vault; field-level encryption for health, safeguarding, ID numbers.
- CI: lint, types, tests, contract parity, i18n and a11y checks, dependency and secret scans on every task branch.
- Infrastructure as code; blue/green deploys per region cell; backups with point-in-time recovery.

## 9. Delivery models and Nexus Control
```
Nexus Control (our cloud)                         Product deployments
 apps/control (UI)  ─┐                             ├─ SaaS shared cell (per region, many tenants)
 control backend    ─┼─ control DB (metadata only) ├─ SaaS dedicated cell (one customer, own DB + keys)
 release pipeline   ─┘                             └─ Self-hosted install (customer servers; Compose or Helm)
        ▲  outbound only: licence check · update metadata · PII-free health   ▲
        └──────────────────────────── M84 install agent ─────────────────────┘
```
- **Same images everywhere.** A deployment differs only by configuration, licence/entitlements and installed
  extensions. Customer-specific work = extension packages (P08), never a fork of the core.
- **Provisioning (SaaS):** P04 creates the tenant in the chosen region cell, its keys in the vault, and the type
  profile; Nexus Control keeps only the tenant id, region, plan and counts.
- **Licences (self-hosted):** P05 signs a licence file (Ed25519). M84 verifies it offline; expiry → grace period →
  read-only mode, never data loss.
- **Updates:** P07 publishes signed images and offline bundles; installs pull them; database migrations are
  forward-only with a tested rollback plan; extensions are re-checked against each release (P08).
- **Telemetry:** versions, health, counts, errors without personal data; customers can switch it off (then licence
  and updates run in offline mode).

## 10. Data vault and provider access
- **Keys:** per-tenant data keys wrapped by a key-encryption key in the vault (KMS/HSM). Dedicated / self-hosted
  customers may supply the key-encryption key (BYOK) or hold it themselves (HYOK). Offboarding destroys the keys.
- **Field encryption** for health, safeguarding, ID numbers, bank details; search uses blind indexes where needed.
- **No standing access:** provider staff identities (P13) have no database or tenant-API roles. Production access is
  only through the **access broker** (P10): request → institution admin approves in M83 → short-lived credential
  scoped to that tenant, modules and mode → every request audited in the tenant's own audit log → auto-revoke.
- **Break-glass:** two provider approvers, tenant notified at once, post-incident report delivered to the tenant.
- **Self-hosted:** no inbound path at all. Support = customer-started screen share or diagnostic bundle generated by
  M84 (logs/config with personal data scrubbed), which the customer reviews before upload.
- **Engineering tools** (migrations, backups, monitoring) never decrypt tenant data; logs and traces are PII-free by
  design (structured fields with an allow-list).
