# Stage 2 — Nexus Control & delivery · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes: **A** UI/theme/text · **B** contracts/mocks · **C** screens · **D** backend / deploy.
> `draft` rows have no task file yet; the planner writes them 2 ahead (`AGENTS.md` §3.5).

**Step:** prototype (`docs/PLAN.md` → Stage 2) · **Modules:** P01–P18, M84 · **Owner-away mode:** D49

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-066 | Open-source swap: OpenBao for Vault, Valkey for Redis (D48; downloads approved, D54) | D | done | Claude | 065 |
| NEX-067 | Control contracts (commercial): staff, accounts, CRM, plans, quotes, billing, usage | B | done | Claude | 065 |
| NEX-068 | Control contracts (delivery): provisioning, deployments, licences, releases, extensions, sandboxes, portability, M84 | B | done | Claude | 067 |
| NEX-069 | Control contracts (operations): support desk, access broker, partners, compliance, projects, analytics | B | done | Claude | 068 |
| NEX-070 | Control mocks: fixtures (customers of the 5 demo tenants + self-hosted + partner) and MSW read handlers | B | done | Claude | 069 |
| NEX-071 | `apps/control` + `@nexus/ui-control`: staff demo sign-in, shell, menu, role guard, services base | C | done | Claude | 070 |
| NEX-072 | P01 Accounts & CRM | C | done | Claude | 071 |
| NEX-073 | P02 Plans, pricing & quotes | C | done | Claude | 071 |
| NEX-074 | P03 Subscription billing | C | done | Claude | 071 |
| NEX-075 | P04 Tenant provisioning & offboarding | C | done | Claude | 071 |
| NEX-076 | P05 Licence management | C | done | Claude | 071 |
| NEX-077 | P06 Deployment registry & fleet health | C | done | Claude | 071 |
| NEX-078 | P07 Release management | C | done | Claude | 071 |
| NEX-079 | P08 Customisation & extensions | C | done | Claude | 071 |
| NEX-080 | P09 Support desk & SLAs | C | done | Claude | 071 |
| NEX-081 | P10 Support access broker (with the M83 approval loop) | C | done | Claude | 071 |
| NEX-082 | P11 Usage & metering | C | done | Claude | 071 |
| NEX-083 | P12 Partners & resellers | C | done | Claude | 071 |
| NEX-084 | P13 Provider staff & security | C | done | Claude | 071 |
| NEX-085 | P14 Compliance & trust operations | C | done | Claude | 071 |
| NEX-086 | P15 Implementation projects | C | done | Claude | 071 |
| NEX-087 | P16 Business analytics | C | done | Claude | 071 |
| NEX-088 | P17 Sandbox, demo & staging environments | C | done | Claude | 071 |
| NEX-089 | P18 Tenant portability & migrations | C | done | Claude | 071 |
| NEX-090 | M84 Install agent screen in campus (self-hosted only) | C | done | Claude | 070 |
| NEX-091 | Stage 2 review build: walkthrough per provider persona, Playwright smoke for control | C | done | Claude | 072–090 |
| NEX-092 | Stage 2 freeze (planner + Owner) — Owner review "all good", D56 | — | done | Claude (planner) | 091 |
| NEX-093 | Stage 1 small fixes: campus token classes in M04, campus test time limit (D54) | C | done | Claude | 065 |
| NEX-094 | One-file language export / import for the Owner's Hindi & Tamil correction (D54) | A | done | Claude | 071 |
| NEX-095 | Licence signing (Ed25519 in OpenBao) and offline verification for M84 (P05, D23, D55) | D | done | Claude | 068 |
| NEX-096 | Control backend skeleton: own app, own database, health, staff `me` (D55) | D | done | Claude | 095 |
| NEX-097 | Staff SSO with mandatory MFA: Keycloak realm `nexus-staff`, OIDC sign-in for Control, sessions (P13, D55) | D | done | Claude | 096 |
| NEX-098 | Lago billing engine: dev stack + `BillingEngine` adapter (D51; downloads approved 2026-11-22) | D | done | Claude | 096 |
| NEX-099 | Stage 2 docs: manual with Nexus Control, guides, presentation, owner checklist | A | done | Claude | 091, 097, 098 |
| NEX-100 | Control app real mode: staff sign-in button → `/auth/login`, `/me` from the control backend, sign-out (P13) | C | done | Claude | 097 |
| NEX-101 | Control API: accounts, notes, staff directory (P01) on the control DB; P01 screens switched to real | D | done | Claude | 096 |
| NEX-102 | Control API: catalogue & quotes (P02), billing (P03), usage (P11) on the control DB; quote send, bank transfer | D | done | Claude | 101 |
| NEX-103 | Control API: licences (P05) — issue, store, download the signed file; P05 screen switched to real | D | done | Claude | 095, 101 |
| NEX-104 | Release signing: signed images and offline update bundles (P07, DM-9) | D | done | Claude | 095 |
| NEX-105 | M84 install agent core: offline licence check, update check from verified bundles, install status, Install page on real data | D | in-progress | Claude | 103, 104 |
| NEX-106 | Tenant export / import between SaaS and self-hosted (P18, DM-8), encrypted with the tenant's keys | D | draft | — | 112 |
| NEX-107 | Payment gateway adapters: Razorpay (IN), Stripe (EU) behind `PaymentGateway` (needs Owner accounts) | D | draft | — | 111 |
| NEX-108 | Packaging: control backend + staff realm + billing stack in Compose and Helm; air-gapped bundle | D | draft | — | 102, 105 |
| NEX-109 | Contract parity for Control (Pydantic ⇄ Zod samples) and remaining screens switched to real | D | draft | — | 101–103 |
| NEX-110 | Stage 2 harden & release: V-1…V-7 for Control, security review, a11y, i18n, performance, guides | — | draft | — | 100–109 |
| NEX-111 | Lago sync: catalogue → plans, subscriptions → Lago, usage → events, Lago invoice webhooks → control DB (D51) | D | draft | — | 098, 102 |
| NEX-112 | M84 encrypted backups and support diagnostic bundles (personal data removed, admin approves before sending) | D | draft | — | 105 |
| NEX-113 | M84 PII-free health reports to Control (licence-bound agent sign-in, can be switched off) and P06 fleet signals on real data | D | draft | — | 105 |
