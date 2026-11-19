# NexusCampus — Product requirements

> Single source of product requirements. Module list: `docs/MODULES.md`. Delivery: `docs/PLAN.md`.
> IDs (`G-3`, `C-2`…) are referenced from task files. Change this file only as planner, with a decision entry.

## 1. Vision
One platform that runs **any learning institution end to end** — from play school to university, and every kind
of private institute — in **any country**, at **enterprise standard**, that keeps working **offline** where it matters,
and where **AI helps every role** without ever being required.
Sold as **SaaS subscription** or as a **self-hosted licence**, both run by us from one provider platform,
**Nexus Control**, and in both we **never access an institution's data without its permission** (§9–10).

## 2. Ideology (non-negotiable principles)
1. **Core + independent modules.** A small mandatory core (identity, tenancy, audit, theme, text, notifications).
   Every other module works alone and depends only on the core. No hard links between optional modules.
2. **Subscription-driven.** Each institution's plan switches modules and AI on or off. Off = hidden, never broken.
3. **Graceful degradation.** If a module, the network, or AI is unavailable, the user's workflow still completes.
4. **The institution owns its look and words.** Theme, fonts, logo and every static text are the institution's to change.
5. **AI is an enhancement.** Optional, metered, privacy-safe, explainable; a human decides anything high-stakes.
6. **Tenant isolation and least privilege** everywhere: data, cache, files, search, AI context, logs.
7. **Simple to understand.** Short docs, bullet points, a new developer understands a module in 10 minutes.

## 3. Institution types (one product, configured per type)
| Code | Type | Examples | Typical shape |
|---|---|---|---|
| EY | Early years | Play school, preschool, nursery, day care, kindergarten | Daily diary, milestones, pickups, no grades |
| K12 | Schools | Primary, secondary, boarding, international (IB, Cambridge, national boards) | Classes/sections, terms, report cards |
| HE | Higher education | College, university, deemed / autonomous, polytechnic, medical, law | Programs, credits, semesters, degree audit |
| VOC | Vocational | ITI, nursing, aviation, hospitality, apprenticeship centres | Trades, practical hours, licences |
| TP | Coaching / test prep | Entrance and competitive exam coaching, tuition centres | Batches, mock tests, ranks |
| SK | Skill & hobby institutes | Language, music, dance, art, sports, coding, driving schools | Rolling enrolment, session packs, levels |
| ONL | Online academies | Self-paced and cohort courses, MOOCs, corporate training | Course catalogue, e-commerce, certificates |
| GRP | Groups | Multi-campus trusts, franchises, chains, education ministries | Hierarchy, consolidated reporting |

Each type ships a **profile**: default modules, terminology pack (e.g. *child / student / learner / trainee*),
academic structure, grading scheme, report templates. Institutions can change all of it.

## 4. Global (G)
- **G-1 Languages:** every UI, email, SMS, PDF and AI answer is localisable (ICU MessageFormat, BCP 47 locales).
  Plural/gender rules, per-user language, **right-to-left** layouts (Arabic, Hebrew, Urdu).
- **G-2 Formats:** dates, numbers, names, addresses, phone (E.164) per locale. Time stored UTC, shown in the
  institution's time zone. Money as integer minor units + ISO 4217 currency; multi-currency fees and payouts.
- **G-3 Calendars:** any academic year start, terms / semesters / trimesters / rolling; weekend days and holidays per
  country/region; optional secondary calendars (Hijri, Hindu, Hebrew) for display.
- **G-4 Grading:** configurable schemes — marks, percentage, letter, GPA/CGPA (4, 5, 10 point), IB, descriptors for
  early years, competency levels, pass rules, weighting, moderation.
- **G-5 Data residency:** tenant chooses region (e.g. India, EU, US, Middle East, APAC); its data and backups stay there.
- **G-6 Compliance packs:** GDPR, UK GDPR, FERPA, COPPA, India DPDP 2023, Brazil LGPD, South Africa POPIA, Singapore PDPA,
  EU AI Act (education AI is high-risk), PCI DSS (via gateways only). Region pack sets consent, retention and minors' rules.
- **G-7 Payments & messaging:** pluggable gateways (Stripe, Razorpay, PayU, Adyen, Paystack, regional wallets/UPI) and
  channels (email, SMS, WhatsApp, push, in-app) chosen per region.
- **G-8 Accessibility:** WCAG 2.2 AA for every screen, in every theme an institution creates.

## 5. Institution control (C)
- **C-1 Theme:** every colour token (light and dark), font families (from the font library or uploaded web fonts),
  radius and density, logo, favicon, login page, email and PDF letterheads. Live preview. Contrast guard blocks
  combinations below WCAG AA. Multi-campus groups can lock parts of the theme for children.
- **C-2 Static texts:** **every** visible string has a stable message key. Layers: platform default →
  institution-type terminology pack → group → institution (→ campus). Overrides per locale, searchable editor,
  preview in context, export/import (XLIFF/JSON), AI translation drafts, change history and rollback.
- **C-3 Configuration without code:** custom fields, custom forms, approval workflows, numbering formats
  (admission no., invoice no.), document and certificate templates, notification templates, dashboards.
- **C-4 Roles:** institution-defined roles from a permission catalogue; scoping by campus / program / class / own records.

## 6. Offline (O)
Each module declares an offline level (see `docs/MODULES.md`):

| Level | Meaning |
|---|---|
| **L0** | Online only. Clear "you are offline" state; nothing is lost. |
| **L1** | Read offline: last-synced data cached on the device. |
| **L2** | Capture offline: create/edit queued on the device, synced later, conflicts resolved by module rules. |
| **L3** | Run offline: full workflow for days on a device or the on-campus **Edge node**, incl. low-bandwidth sites. |

- **O-1** Sync status is always visible (synced / pending n / conflict). **O-2** Every offline write is idempotent and
  audited with device and time. **O-3** Offline data is encrypted on device and wiped on sign-out or remote revoke.
- **O-4** Mobile-first for offline modules (teachers, drivers, gate staff, parents on weak networks).

## 7. Enterprise (E)
- **E-1 Identity:** email/password + MFA, passkeys, SSO (SAML 2.0, OIDC: Google, Microsoft, others), SCIM provisioning,
  delegated admin, guardian–child links, session and device management.
- **E-2 Security:** OWASP ASVS L2, encryption in transit and at rest, field-level encryption for sensitive data,
  secrets vault, least privilege, pen tests. Target certifications: ISO 27001, SOC 2 Type II.
- **E-3 Audit:** every change and every sensitive read logged (who, what, when, where, before/after), tamper-evident,
  exportable. Data subject requests (access, correct, delete, export) supported per G-6.
- **E-4 Reliability:** 99.9 % availability per region, RPO ≤ 15 min, RTO ≤ 4 h, zero-downtime deploys, status page.
- **E-5 Scale:** 10,000 tenants per region; 100,000 learners in one tenant; p95 API < 300 ms for common reads.
- **E-6 Hierarchy:** group → institution → campus → department, with consolidated reporting and inherited settings.
- **E-7 API-first:** every screen uses a public, versioned API; webhooks; rate limits per tenant; SDKs.
- **E-8 Interoperability:** LTI 1.3 Advantage, OneRoster 1.2, QTI 3, xAPI / cmi5, SCORM 1.2/2004, Open Badges 3,
  W3C Verifiable Credentials, Ed-Fi, IMS CASE, Google Workspace / Microsoft 365, accounting ERPs.
- **E-9 Operability:** structured logs, metrics, traces (OpenTelemetry), per-tenant usage and cost, feature flags.

## 8. AI (A)
- **A-1 Optional per institution and per module;** AI credits metered and capped per tenant.
- **A-2 Same permissions as the user:** AI reads only through the API with the user's rights. No cross-tenant context.
- **A-3 Privacy:** PII redaction before model calls; no training on customer data; region-pinned processing (G-5).
- **A-4 Human in the loop** for high-stakes outcomes (admissions, grades, discipline, safeguarding, hiring, proctoring):
  AI suggests with reasons, a person decides, both are logged (EU AI Act).
- **A-5 Explainable:** answers cite the records used; predictions show their main factors.
- **A-6 Multilingual:** answers in the user's language; AI drafts translations for C-2.
- **A-7 Capability types** used across modules: *Ask* (questions over data), *Draft* (messages, remarks, plans),
  *Generate* (content, questions, timetables), *Predict* (risk, demand), *Classify* (triage, tagging),
  *Tutor* (learner-facing help), *Act* (multi-step agent actions, always confirmed by the user).
- **A-8 Quality:** each AI feature has an evaluation set and a safety review before release; usage and feedback tracked.

## 9. Delivery models (DM) — one product, sold two ways
| Model | Who | Commercial | Runs where | Data |
|---|---|---|---|---|
| **DM-1 SaaS shared** | Small and mid institutes | Subscription (monthly/annual, per learner + add-ons) | Our region cell, shared with other tenants (RLS) | Isolated per tenant, per-tenant keys |
| **DM-2 SaaS dedicated** | Large institutes, groups | Subscription, enterprise contract | Our cloud, a cell only for them | Own database and keys (BYOK option) |
| **DM-3 Self-hosted** | Institutes that need full control for security/privacy | Licence purchase (perpetual or term) + support & update contract | Their data centre or private cloud; air-gapped option | Fully theirs; we have no access |
| **DM-4 Hybrid** | Any of the above + weak networks | As above | SaaS or self-hosted + on-campus Edge node | As the main model |

- **DM-5 One codebase, one release train** for all models. No customer forks: per-customer needs are met by
  configuration, entitlements, licence terms and **extensions** (separate packages built on the extension SDK).
- **DM-6 We maintain what we deliver:** for self-hosted customers we ship signed updates, security patches, their
  extensions and new modifications, and give support — without access to their data (V-6).
- **DM-7 Feature parity:** features that need external services (AI, SMS, payments, email) use the customer's own
  accounts/keys in self-hosted installs, or switch off gracefully.
- **DM-8 Moving between models:** a standard, encrypted tenant export lets an institution move SaaS ⇄ self-hosted.
- **DM-9 Installs:** Docker Compose for small single-server installs; Kubernetes (Helm) for large ones; offline
  update bundles for air-gapped sites. Optional source-code escrow in licence contracts.

## 10. Data vault and provider access (V) — "no access without the institution's permission"
- **V-1 Zero standing access.** No provider staff (support, engineering, sales) can read institution data by
  default, in any delivery model. Tools for our staff are built so they cannot.
- **V-2 Vault and keys.** Each tenant's data is encrypted at rest with its own keys held in a vault (envelope
  encryption); sensitive fields have field-level encryption. Dedicated and self-hosted customers may bring/hold
  their own keys (BYOK / HYOK). Destroying a tenant's keys on offboarding makes its data unreadable (crypto-shred).
- **V-3 Access grants.** Support access only through an **access request** that the institution's admin approves in
  their own app: scope (modules, read-only or edit), duration (max 72 h), reason, named staff. Every action is
  recorded and visible to the institution; access ends automatically.
- **V-4 Operate without reading.** Backups, migrations, monitoring and billing work on encrypted data and metadata.
  Logs, metrics, traces and telemetry contain no personal data.
- **V-5 Break-glass** (legal order or security incident only): two-person approval on our side, the institution is
  notified immediately and receives a report.
- **V-6 Self-hosted:** we have no network path into the install. The install pulls licence checks and updates (or uses
  offline bundles). Support uses customer-started screen sharing or **diagnostic bundles** that the customer
  generates, with personal data scrubbed, and reviews before sending.
- **V-7 Nexus Control stores only commercial and technical metadata** (accounts, contracts, licences, versions,
  counts, health) — never learner, family or staff records.

## 11. Personas
Platform: super admin, support agent, partner. Group: director, auditor. Institution: owner/principal/dean, admin,
registrar, admissions officer, accountant, HR, teacher/faculty, class teacher/advisor, examiner, librarian, counsellor,
nurse, transport manager, driver, warden, gate staff, store/canteen staff, placement officer. Learners: student,
child (via guardian), alumni. Family: parent/guardian, pickup person. External: applicant, vendor, recruiter, inspector.
Provider (Nexus Control): sales, billing, support agent, implementation consultant, release manager, site reliability
engineer, security officer, partner/reseller. None of them sees institution data without a grant (V-3).
