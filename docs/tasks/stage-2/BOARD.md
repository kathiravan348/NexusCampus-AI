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
| NEX-105 | M84 install agent core: offline licence check, update check from verified bundles, install status, Install page on real data | D | done | Claude | 103, 104 |
| NEX-106 | Tenant export (DM-8, D58): one tenant's rows, encrypted so only the destination install can open the file | D | done | Gemini | 112 |
| NEX-107 | Payment gateway adapters: Razorpay (IN), Stripe (EU) behind `PaymentGateway` (needs Owner accounts) | D | draft | — | 111 |
| NEX-108 | Packaging: Nexus Control as a Compose stack (control backend, staff realm, billing), images we already have | D | done | Gemini | 111 |
| NEX-109 | ~~Remaining Control screens switched to real data~~ — split into NEX-121–126 (parity done in NEX-116) | D | withdrawn | — | — |
| NEX-110 | Stage 2 harden & release: V-1…V-7 for Control, security review, a11y, i18n, performance, guides | — | draft | — | 100–108, 111, 119–126 |
| NEX-111 | Lago sync part 2: signed invoice webhooks into Control, and cancellations (part 1: NEX-118; D51) | D | done | Gemini | 118 |
| NEX-112 | M84 encrypted backups and support diagnostic bundles (personal data removed, admin approves before sending) | D | done | Claude | 105 |
| NEX-113 | Control: P06 fleet on real data and the agent health check-in endpoint (per-deployment agent token) | D | done | Gemini | 103 |
| NEX-114 | M84: install agent sends PII-free health reports to Control (off when telemetry off or air-gapped) | D | done | Gemini | 113 |
| NEX-115 | Control: P07 releases and rollouts on real data, and the agent's online update check (agent token) | D | done | Gemini | 113 |
| NEX-116 | Control contract parity: Pydantic ⇄ Zod for every real Control response (as NEX-059) | D | done | Gemini | 115 |
| NEX-117 | M84 online update check, signed end to end: Control stores the signed manifest, the agent verifies it | D | done | Gemini | 115, 116 |
| NEX-118 | Lago sync part 1: per-learner plans, customers, subscriptions and learner usage → Lago (one way, idempotent) | D | done | Gemini | 116 |
| NEX-119 | Tenant import (DM-8, D58): unwrap with the import key, check schema revision, load into an empty tenant, re-encrypt fields | D | done | Gemini | 106 |
| NEX-120 | Packaging: Helm chart for large installs (needs the Owner's OK to download `helm`) | D | draft | — | 108 |
| NEX-121 | Control on real data: P04 tenant provisioning and P18 moves (portability jobs, shred certificates) | D | draft | — | 119, 116 |
| NEX-122 | Control on real data: P09 support desk (tickets, replies, SLA policies, knowledge base) | D | done | Gemini | 116, 108 |
| NEX-123 | Control on real data: P08 extensions, P15 projects and P17 sandboxes (reads) | D | ready-for-review | Gemini | 122 |
| NEX-124 | Control on real data: P12 deals and commissions, P16 analytics (reads) | D | planned | — | 123 |
| NEX-125 | Control on real data: P10 access broker, requests reach the institution's M83 approval (needs a decision: how Control calls an install) | D | draft | — | 122 |
| NEX-126 | Control on real data: P14 trust (sub-processors, certifications, security incidents, DPAs) | D | draft | — | 124 |
