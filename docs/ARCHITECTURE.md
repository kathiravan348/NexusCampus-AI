# NexusCampus — Architecture

> Target architecture for all stages (`docs/PLAN.md`). Requirements it serves: `docs/REQUIREMENTS.md`. Decisions: `docs/DECISIONS.md`.

## 1. Big picture
```
Clients ── PWA web app (staff, admin, family, learner) · white-label mobile apps (Stage 7) · public API / LTI
   │        └─ offline kit: service worker + IndexedDB store + sync outbox (L1–L3)
   ▼
Region cell (one per data region: IN, EU, US, ME, APAC…) — identical stack, data never leaves its region
(first cells: AWS `ap-south-1` IN and `eu-central-1` EU, D45)
   ├─ API gateway: auth, tenant resolution, rate limits, API versions
   ├─ App (modular monolith, FastAPI): core + one package per module (M01…M91)
   ├─ Workers: jobs, notifications, sync merges, reports, imports
   ├─ AI gateway (M11): redaction, capability-tier routing, metering, evaluations → Claude (default/Bedrock/Vertex), pluggable cloud or local OpenAI-compatible LLM (air-gapped)
   ├─ PostgreSQL 16 (Row-Level Security by tenant) · Valkey (Redis protocol, D48) · object storage (S3-compatible) · search (PostgreSQL full-text + pgvector, D47)
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
- SSO (SAML/OIDC), SCIM, MFA, passkeys; sessions in secure cookies for web, tokens for apps and API. Keycloak holds
  credentials, MFA and passkeys (one realm per cell, one organization per tenant); the backend issues its own sessions
  and serves SCIM (D44).
- Secrets in OpenBao (open-source fork with the Vault API, D48; raft storage in installs); per-tenant Transit keys for field-level
  encryption of health, safeguarding, ID numbers (D46).
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
- **Control backend (NEX-096, NEX-108):** `nexus.control` in the backend package, its own app (`nexus.control.main`,
  `/control/api/v1/*`), its own database `nexus_control` with its own read-mostly role `control_app` and its own
  migrations (`backend/control_migrations`, `nexus-control-db`). Packaged as one Compose stack in `deploy/control/`
  (`control-db`, `control-migrate`, `control-api` on `127.0.0.1:8100`, `staff-keycloak`, `valkey`, `openbao`, and the
  included Lago stack on the internal network only, with private Lago webhooks enabled for `control-api:8100`). It never
  connects to a product database.
- **Staff sign-in (NEX-097):** Keycloak realm `nexus-staff` (never the product realm, D21), client `nexus-control`.
  Password = level 1, one-time code (TOTP) = level 2 = `acr` `mfa`; the client's minimum ACR is `mfa`, the login
  asks for it and the callback refuses any other `acr`. Sessions: random token in an HttpOnly cookie (path
  `/control`, Secure in prod), only its SHA-256 in `staff_sessions`, 60 minutes, revoked on sign-out.
- **Billing (NEX-098, NEX-118, NEX-111, D51):** Lago runs only in our control plane (`backend/compose.billing.yaml`: own
  PostgreSQL, Valkey, API, worker, clock; API on 127.0.0.1; no Lago UI, PDF service or product telemetry). The control
  backend uses it only through `BillingEngine` (`nexus.control.billing`): customers carry our account id, legal name,
  country and currency; usage is the active-learner count (`max` per period, D52), sent with an idempotent transaction
  id. Idempotent sync (`python -m nexus.devtools.billing_sync [--dry-run]`, `nexus.control.billing.sync`) reads
  `nexus_control` as `control_app` (read-only), pushes active per-learner SaaS plans, subscribing accounts, active /
  trialing / past-due subscriptions and learner usage events into Lago, and terminates cancelled subscriptions via
  `BillingEngine.terminate`. Lago pushes finalized invoices and payment status updates back through
  `POST /control/api/v1/billing/lago-webhook` (constant-time `X-Lago-Signature` HMAC-SHA256 verification, ≤ 256 KB,
  SHA-256 raw-body dedup in `billing_webhook_events`, internal `invoices.lago_invoice_id`). Never shipped to customers.
- **Release signing (NEX-104):** each release has a signed manifest (`nexus-release/1`: version, channel, oldest
  version that can upgrade straight to it, each image's content id, migration heads, notes hash, and every bundled
  file's SHA-256 and size), signed in OpenBao (`nexus-release`, Ed25519, never exported). Offline bundles are one
  `.tar`; `nexus-release-verify` checks them with pinned public keys before anything is loaded (refuses links,
  `..`, absolute paths, missing / extra / changed files). Image signatures with cosign can be added later.
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
- **Fleet registry & agent check-ins (NEX-113):** `deployments`, `health_signals` (latest check-in only) and
  `deployment_agent_tokens` (SHA-256 only, written solely by the owner-role tool `nexus-control-agent-token`).
  Installs report outbound to `POST /control/api/v1/agent/health` with their per-deployment bearer token (no staff
  cookie), strict PII-free payload ≤ 4 KB, max 1 report per 60 s; air-gapped deployments are refused (`403`). Server
  stamps `last_check_in_at` and derives `health` (`healthy` / `degraded`).
- **Releases, rollouts & online update check (NEX-115):** `releases` and `rollouts` (read-only for `control_app`).
  Installs query `GET /control/api/v1/agent/update` with the same per-deployment bearer token (max 1 per 60 s,
  air-gapped `403`) and receive `{ release }` for the newest published, signed release on their channel with
  `minUpgradeFrom` ≤ current version (pre-releases on `preview` only) whose `running` or `done` rollout includes that
  deployment, or `{ release: null }`.
- **Support desk (P09, NEX-122):** `tickets`, `ticket_replies`, `sla_policies`, and `kb_articles`. `control_app` has
  `SELECT` on all four, `INSERT` on `ticket_replies`, and column-scoped `UPDATE (status, assignee_staff_id, resolved_at)`
  on `tickets` (no deletes, no writes to SLA policies or articles). Partner viewers see only tickets for their managed
  accounts and replies joined through those visible tickets (never by reply id alone), and no SLA policies or articles.
  Staff replies run in one transaction and log ticket id, reply id, and staff id only (never reply text, V-6).
- **Extensions, projects & sandboxes (P08, P15, P17, NEX-123):** `extensions`, `extension_compatibility` (composite PK
  `(extension_id, release_version)`), `implementation_projects` (`tasks` JSONB with DB CHECK requiring `go_live_date`
  and every task `done: true` when `status = 'live'`), and `sandboxes` (DB CHECKs enforcing synthetic data on
  `sales_demo`, non-null `account_id` on `staging_clone`, and `expires_at > created_at`). `control_app` has `SELECT`
  only on all four; partner scoping uses `Resource` (compatibility rows and unattached sandboxes are hidden from
  partners).
- **Partners & analytics (P12, P16, NEX-124):** `deal_registrations`, `commissions` (`paid_at` iff `status = 'paid'`),
  `business_metrics` (stored monthly snapshots keyed by `month` `YYYY-MM`, DB CHECKs for `arr_minor = mrr_minor * 12`
  and `new_accounts <= active_accounts`), and `account_health` (keyed by `account_id`, 1–5 message-key reasons,
  `ai_generated = true`, score/risk CHECKs). `control_app` has `SELECT` only on all four; partners see only their
  managed accounts' deals and health, never commissions or business metrics.
- **Compliance & trust (P14, NEX-126):** `sub_processors`, `certifications` (`valid_until` iff `status = 'certified'`),
  `security_incidents` (unique `affected_account_ids` via `control_text_array_unique`, `breach_notification_due_at` iff
  `personal_data_affected` and `>= detected_at`, `notified_at` only on a breach), and `dpa_records` (`version` `N.N`).
  `control_app` has `SELECT` only on all four; partners see only their managed accounts' DPAs; incident titles are
  never logged (V-6).

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
