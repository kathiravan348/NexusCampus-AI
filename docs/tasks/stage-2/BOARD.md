# Stage 2 — Nexus Control & delivery · task board

> Read at the start of every session. Update status + owner BEFORE starting work.
> Statuses: draft · planned · in-progress · ready-for-review · in-review · changes-requested · done · withdrawn
> A task becomes `planned` only when the planner has written its file (in this folder) from `docs/templates/TASK.md`.
> Lanes: **A** UI/theme/text · **B** contracts/mocks · **C** screens · **D** backend / deploy.
> `draft` rows have no task file yet; the planner writes them 2 ahead (`AGENTS.md` §3.5).

**Step:** prototype (`docs/PLAN.md` → Stage 2) · **Modules:** P01–P18, M84 · **Owner-away mode:** D49

| ID | Title | Lane | Status | Owner | Depends on |
|---|---|---|---|---|---|
| NEX-066 | Open-source swap: OpenBao for Vault, Valkey for Redis (D48) — **held: needs image downloads** | D | planned | — | 065 |
| NEX-067 | Control contracts (commercial): staff, accounts, CRM, plans, quotes, billing, usage | B | done | Claude | 065 |
| NEX-068 | Control contracts (delivery): provisioning, deployments, licences, releases, extensions, sandboxes, portability, M84 | B | planned | — | 067 |
| NEX-069 | Control contracts (operations): support desk, access broker, partners, compliance, projects, analytics | B | draft | — | 068 |
| NEX-070 | Control mocks: fixtures (customers of the 5 demo tenants + self-hosted + partner) and MSW read handlers | B | draft | — | 069 |
| NEX-071 | `apps/control` + `@nexus/ui-control`: staff demo sign-in, shell, menu, role guard, services base | C | draft | — | 070 |
| NEX-072 | P01 Accounts & CRM | C | draft | — | 071 |
| NEX-073 | P02 Plans, pricing & quotes | C | draft | — | 071 |
| NEX-074 | P03 Subscription billing | C | draft | — | 071 |
| NEX-075 | P04 Tenant provisioning & offboarding | C | draft | — | 071 |
| NEX-076 | P05 Licence management | C | draft | — | 071 |
| NEX-077 | P06 Deployment registry & fleet health | C | draft | — | 071 |
| NEX-078 | P07 Release management | C | draft | — | 071 |
| NEX-079 | P08 Customisation & extensions | C | draft | — | 071 |
| NEX-080 | P09 Support desk & SLAs | C | draft | — | 071 |
| NEX-081 | P10 Support access broker (with the M83 approval loop) | C | draft | — | 071 |
| NEX-082 | P11 Usage & metering | C | draft | — | 071 |
| NEX-083 | P12 Partners & resellers | C | draft | — | 071 |
| NEX-084 | P13 Provider staff & security | C | draft | — | 071 |
| NEX-085 | P14 Compliance & trust operations | C | draft | — | 071 |
| NEX-086 | P15 Implementation projects | C | draft | — | 071 |
| NEX-087 | P16 Business analytics | C | draft | — | 071 |
| NEX-088 | P17 Sandbox, demo & staging environments | C | draft | — | 071 |
| NEX-089 | P18 Tenant portability & migrations | C | draft | — | 071 |
| NEX-090 | M84 Install agent screen in campus (self-hosted only) | C | draft | — | 070 |
| NEX-091 | Stage 2 review build: walkthrough per provider persona, Playwright smoke for control | C | draft | — | 072–090 |
| NEX-092 | Stage 2 freeze (planner + Owner) | — | draft | — | 091 |
