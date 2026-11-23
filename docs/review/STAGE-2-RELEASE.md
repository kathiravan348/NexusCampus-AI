# Stage 2 — release checklist

> For the Owner's release approval (NEX-137). Filled on 2026-11-23 on the Owner PC (Windows 11, Docker Desktop,
> Node 24, Python 3.12, PostgreSQL 16 + pgvector, OpenBao 2.7.2, Valkey 9.0.7, Keycloak 26.4.7, Lago 1.44.0) against
> `task/NEX-137` (stacked on `NEX-121..136, 107, 110`; Helm chart on `task/NEX-120`). Items marked **Owner** need a
> person or external credentials, not a local test.

## 1. Result at a glance

| Area | Result |
|---|---|
| No-access & command-channel gates V-1…V-7 (NEX-110, must pass) | **Pass** — 19 Control & command-channel security tests + 17 Stage 1 V-tests; broken-guard fixture turns the route walk red |
| Control contract parity (Pydantic ⇄ frozen Zod, incl. cross-field rules) | **Pass** — all 46 Control contract models match Zod's exact verdict (`expected = case["valid"]`) |
| OpenBao key custody & root-token revocation (NEX-110) | **Pass** — `transit/export/*` denied (`403`); root token revoked and stripped from disk after `deploy/compose` and `deploy/control` setup |
| Backend checks (`uv run --project backend backend-check`) | **Pass** — 497 tests (ruff format, ruff lint, mypy `--strict` on 311 files, pytest) in `1m 25.7s` |
| Frontend checks (`pnpm --dir frontend review:check`) | **Pass** — format, lint, typecheck, Vitest workspace tests, production + Storybook builds in `1m 12.0s` |
| Real-mode Control accessibility (WCAG 2.2 AA, axe, every role) | **Pass** — `e2e:control:real` (`control-a11y.spec.ts`): sign-in + all 20 screens in light & dark + all 9 staff roles + forbidden routes, 0 serious/critical issues |
| Real-mode Control languages en / hi / ta (D42, D53) | **Pass** (automated, `control-languages.spec.ts`: all 20 screens in `en`, `hi`, `ta`, 0 raw/missing keys); **Owner**: native-speaker review open |
| Performance budgets (soft, `docs/TIMINGS.md`) | **Pass** — 41 Control list endpoints p95 `8.5–18.5 ms` (`12.0 ms` overall, budget `300 ms`); agent calls `8.2–70.4 ms` (budget `300 ms`); Control 4G cold load `2.37 s` (budget `6 s`) |
| Packaging: `deploy/control` & `deploy/compose` install, upgrade, backup/restore, export/import | **Pass** — Control install `60.8 s` / upgrade `22.8 s` / backup+restore `4.8 s`; product install `93.1 s` (cold build) / upgrade `8.8 s` / backup+restore + tenant export/import verified; torn down (`down -v`) |
| Packaging: Helm chart (`deploy/helm/nexuscampus`, NEX-120) | **Pass** (`helm lint --strict` + `helm template` + `test_helm_chart.py` 3/3 pass); **Owner**: live Kubernetes cluster install open (`no cluster` on dev PC) |

## 2. Stage 2 modules (P01–P18 & M84) — task, test, and result

| Module | Scope | Prototype / Build tasks | Automated & live verification | Result |
|---|---|---|---|---|
| **P01** Accounts & CRM | Accounts, contacts, opportunities, contracts, notes; partner scoping | NEX-072, NEX-101 | `tests/db/control/test_accounts_api.py`, `test_control_no_access.py::test_V1_partner_scoping_on_every_control_list`, `control-a11y.spec.ts` | **Pass** |
| **P02** Pricing & quotes | Catalogue, regional prices, quotes, AI-draft human-review gate | NEX-073, NEX-102 | `tests/db/control/test_commercial_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P03** Billing & dunning | Subscriptions, invoices, payments, credit notes, reminders, Lago sync & webhooks, Razorpay INR links (D51, D62) | NEX-074, NEX-102, NEX-118, NEX-111, NEX-107 | `tests/db/control/test_commercial_api.py`, `test_billing_sync.py`, `test_lago_webhooks.py`, `test_razorpay_payments.py` + live Razorpay Test Mode API (`plink_U3WVITB4nOOJba`) | **Pass** (INR live; EU Stripe is draft NEX-138) |
| **P04** Provisioning & offboarding | 5-step cell provisioning (`tenant.provision`), 4-step offboarding (`tenant.freeze`/`export`/`destroy_keys`), four-eyes key destruction, OpenBao-signed `nexus-shred` certificates (D60, D61) | NEX-075, NEX-121, NEX-127, NEX-132, NEX-133, NEX-134 | `tests/db/test_tenant_provisioning.py`, `test_tenant_offboarding_commands.py`, `tests/db/control/test_provisioning_writes.py`, `test_offboarding_writes.py` | **Pass** |
| **P05** Licensing | Offline-verifiable Ed25519 `nexus-licence` files, 1-year renewal, grace & read-only enforcement | NEX-076, NEX-098, NEX-103, NEX-104 | `tests/licensing/test_licence_file.py`, `tests/db/control/test_licences_api.py`, `tests/agent/test_agent_licence.py` | **Pass** |
| **P06** Fleet & deployments | Cells, dedicated & self-hosted deployments, per-deployment hashed bearer token, PII-free health check-ins, pull-only signed D60 command queue (`nexus-command/1`) | NEX-077, NEX-113, NEX-128 | `tests/db/control/test_fleet_api.py`, `test_commands_api.py`, `tests/security/test_command_channel.py` | **Pass** |
| **P07** Releases & rollouts | Signed release manifests (`nexus-release`), offline air-gapped bundles, publish gate (AI-notes review + verified manifest), ring 0→3 rollouts auto-completing on health check-in | NEX-078, NEX-105, NEX-115, NEX-117, NEX-130 | `tests/db/control/test_releases_api.py`, `test_release_import.py`, `test_release_writes.py` | **Pass** |
| **P08** Extensions | Signed customer extensions & release compatibility checks (AI-drafted checks labelled) | NEX-079, NEX-123 | `tests/db/control/test_delivery_extras_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P09** Support desk | Tickets, replies, internal notes, SLA policies, localized knowledge base; partner scoping; no message body in logs | NEX-080, NEX-122 | `tests/db/control/test_support_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P10** Access broker | Time-limited access requests (≤ 72 h, `M83` forbidden) queued as signed `access_request.file` commands; M83 institution approval/rejection syncs back; four-eyes break-glass | NEX-081, NEX-125, NEX-131 | `tests/db/control/test_broker_api.py`, `tests/db/test_agent_broker.py` | **Pass** |
| **P11** Usage & metering | Per-tenant / per-deployment usage records (`learners`, `staff`, `storage_gb`, `ai_credits`, `messages`) & Lago usage push | NEX-082, NEX-102, NEX-118 | `tests/db/control/test_commercial_api.py`, `test_billing_sync.py` | **Pass** |
| **P12** Partners & deals | Reseller partners, deal registrations, commissions; strict partner row filtering across Control | NEX-083, NEX-124 | `tests/db/control/test_partners_analytics_api.py`, `test_control_no_access.py` | **Pass** |
| **P13** Staff & security | Dedicated `nexus-staff` Keycloak realm, mandatory MFA (`acr_values=mfa`), 9 roles / 36 permissions, `HttpOnly; SameSite=Strict` cookie + `Origin` write guard | NEX-084, NEX-096, NEX-097, NEX-100, NEX-110 | `tests/control/test_auth.py`, `tests/db/control/test_control_db.py`, `test_control_no_access.py` | **Pass** |
| **P14** Trust & compliance | Sub-processors, certifications (`iso27001`, `iso27701`, `soc2`, `cert_in`), security incidents (breach clock), signed DPAs | NEX-085, NEX-126 | `tests/db/control/test_trust_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P15** Implementation projects | Onboarding, migration, self-hosted install & training projects with tasks and AI-drafted plan flag | NEX-086, NEX-123 | `tests/db/control/test_delivery_extras_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P16** Business analytics | Monthly ARR/NRR/customer metrics and AI-estimated account churn-risk health scores | NEX-087, NEX-124 | `tests/db/control/test_partners_analytics_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P17** Sandboxes | Synthetic sales demos and masked staging clones with automatic expiry | NEX-088, NEX-123 | `tests/db/control/test_delivery_extras_api.py`, `control-a11y.spec.ts` | **Pass** |
| **P18** Portability & moves | 7-step moves (`saas_to_self_hosted`, `self_hosted_to_saas`, `region_move`) orchestrating source/target cell commands and linked NEX-134 four-eyes shred certificate (D61) | NEX-089, NEX-121, NEX-135, NEX-136 | `tests/db/test_tenant_move_commands.py`, `tests/db/control/test_moves_writes.py` | **Pass** |
| **M84** Install agent | Licence verification, offline & online signed updates, PII-free health check-in, encrypted backups, redacted diagnostics, NXTE/1 tenant export & import, D60 command runner | NEX-091, NEX-104..106, NEX-112, NEX-114, NEX-117, NEX-119, NEX-129, NEX-131, NEX-133, NEX-135 | `tests/agent/*`, `tests/db/test_tenant_export.py`, `test_tenant_import.py`, `test_agent_broker.py` | **Pass** |

## 3. Security hardening summary (NEX-110, `docs/review/STAGE-2-SECURITY.md`)

`uv run --project backend pytest backend/tests/security -v` — 36 security tests (17 Stage 1 + 19 Stage 2):

- **V-1 Zero standing access & Control isolation:** AST walk proves no Control module imports product DB, tenancy, or models; full route walk over `/control/api/v1` proves every route requires staff permission, agent bearer token, webhook HMAC signature, or the 6-route public allowlist (and `test_V1_broken_guard_fixture_fails_the_route_walk` proves an unguarded route turns the check red); partner users (`stf-0051`) see only their own accounts and get `404`/`403` elsewhere.
- **V-2 Key custody & OpenBao root revocation:** Both `deploy/compose` and `deploy/control` policies explicitly deny `transit/export/*`; signing keys (`nexus-licence`, `nexus-release`, `nexus-command`, `nexus-shred`) are `exportable=false`; both install scripts revoke the OpenBao root token after setup (`bao token revoke -self`) and strip `root_token` from `vault-init.json` / `.env.vault-init.json`.
- **V-3..V-5 Access broker & four-eyes:** Access requests arrive via signed `access_request.file` commands, never allow `M83`, and sync only metadata back; P04 key destruction and P10 break-glass require two distinct staff approvers at API, DB CHECK, and agent layers.
- **V-6 Pull-only command channel & request safety:** Forged, tampered, replayed, expired, foreign-deployment, and unknown-kind commands never execute; stolen deployment tokens get `404` on foreign commands; air-gapped deployments get `403`. Staff cookies use `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `Path=/control`; browser writes enforce `Origin == NEXUS_CONTROL_APP_PUBLIC_URL` (`403` otherwise); API responses include `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS in prod.
- **V-7 Metadata boundary & strict contract parity:** Schema walk across all Control tables confirms zero learner/family/medical/safeguarding/ID/payment-card columns; log capture across Control requests finds zero contact emails or secrets; all 46 Control Pydantic response models enforce frozen Zod cross-field refinements (`test_control_parity.py` with `expected = case["valid"]`).

## 4. Accessibility and languages (`e2e:control:real`)

| Check | Command | Result |
|---|---|---|
| axe WCAG 2.0/2.1/2.2 A+AA, sign-in + all 20 Control screens (`/`, P01–P18, `/accounts/acc-ls`), light + dark, real data | `pnpm --dir frontend e2e:control:real` (`control-a11y.spec.ts`) | **Pass** — 0 serious or critical violations |
| axe WCAG 2.0/2.1/2.2 A+AA, all 9 staff roles (`super_admin`, `sales`, `billing`, `support`, `implementation`, `release_manager`, `sre`, `security_officer`, `partner`) across every permitted page + forbidden route (`No access`) | `pnpm --dir frontend e2e:control:real` (`control-a11y.spec.ts`) | **Pass** — 0 serious or critical violations |
| English (`en`), Hindi (`hi`), and Tamil (`ta`) across all 20 Control screens on real data | `pnpm --dir frontend e2e:control:real` (`control-languages.spec.ts`) | **Pass** — `<html lang>` + target script on every heading + 0 raw or missing keys |
| Mock-mode Control smoke, RTL, pseudo-locale, 360px mobile & desktop | `pnpm --dir frontend e2e` (`control.spec.ts`) | **Pass** (NEX-090) |
| **Owner:** native-speaker review of every Hindi and Tamil text (D42, NEX-094) | person (`docs/review/TRANSLATIONS.csv`) | **Open (Owner)** — single CSV export/import ready via `pnpm --dir frontend texts:export` / `texts:import` |

## 5. Performance budgets (soft, `docs/TIMINGS.md`)

| Key | Measured | Budget | Status |
|---|---|---|---|
| `control:backend:start` (`nexus-control-dev` to ready) | `1.07 s` | `15 s` | OK |
| `dev:control` (Control Vite dev server ready) | `0.32 s` | `8 s` | OK |
| `build:control` (Control production build) | `3.54 s` | `45 s` | OK |
| `preview:control` (Control preview server ready) | `0.32 s` | `5 s` | OK |
| `control:api:list:p95` (41 Control list endpoints × 20 calls, demo data) | `8.5–18.5 ms` (`12.0 ms` overall; slowest `accounts` `18.5 ms`) | `300 ms` | OK |
| `agent:api:p95` (`/agent/health` `70.4 ms`, `/agent/update` `12.5 ms`, `/agent/commands` `8.2 ms`) | `8.2–70.4 ms` | `300 ms` | OK |
| `control:load:4g` (built Control app, cold, 150 ms RTT, 1.6 Mbit/s down, 356 KiB) | `2.37 s` | `6 s` | OK |
| `review:check` (frontend format, lint, typecheck, test, build) | `1m 12.0s` | `7 min` | OK |
| `backend:check` (backend format, lint, mypy strict, 497 pytest tests) | `1m 25.7s` | `3 min` | OK |

## 6. Packaging, install, upgrade, backup/restore, and portability runs

All runs executed on this host and torn down (`docker compose ... down -v` and temporary `.env` / `.secrets` removed):

| Check | Measured time & verification | Result |
|---|---|---|
| `deploy/control` fresh install (`install.ps1`) | `60.83 s` (cached image) / `66.14 s` (with image rebuild); OpenBao root token revoked (`CTRL_HAS_ROOT_TOKEN=False`), `nexus-licence`/`release`/`command`/`shred` active, `transit/export/*` denied (`403`) | **Pass** |
| `deploy/control` upgrade (`install.ps1` re-run without root token) | `22.77 s` (`CTRL_RERUN_EXIT=0`, app token renewed, forward-only migrations idempotent) | **Pass** |
| `deploy/control` backup & restore (`control-db` + `lago-db` `pg_dump -Fc` → `pg_restore` into scratch DBs `nexus_control_restore` & `lago_restore`) | `4.78 s` (`CTRL_DB_EXIT=0`, `LAGO_DB_EXIT=0`, schema and Lago organization row verified); torn down with `down -v` | **Pass** |
| `deploy/compose` (product) fresh install (`install.ps1`) | `93.10 s` (including full `api` + `web` Docker image build); OpenBao root token revoked (`HAS_ROOT_TOKEN=False`), Transit encrypt `exit 0`, `transit/export/*` denied (`403`) | **Pass** |
| `deploy/compose` (product) upgrade (`install.ps1` re-run without root token) | `8.78 s` (`RERUN_EXIT=0`, app token renewed, migrations idempotent) | **Pass** |
| `deploy/compose` backup & restore (`pg_dump -Fc` → `pg_restore` into scratch DB `nexus_restore`) + tenant export/import (`NEX-119`, `NXTE/1`) between two databases | Backup/restore `0.95 s` (`PROD_DB_EXIT=0`, `51` tables restored in `nexus_restore`); tenant export/import between two databases (`exp-20261123080809-9fa36c.nxte`, `17,624` bytes, `40` tenant tables, `81` rows, `chainOk: True`, `checkpointOk: True`); torn down with `down -v` | **Pass** |
| Helm chart (`deploy/helm/nexuscampus`, `task/NEX-120` `62677b5`) | `helm lint --strict` (default, all-external, air-gapped) + `helm template` + `test_helm_chart.py` (`3 passed in 1.31s` under Helm v4.3.1); live K8s install: **no cluster** on dev PC | **Pass** (`lint`/`template`); live cluster open |

## 7. Open items for the Owner / before production launch

| Item | Who | Note |
|---|---|---|
| Native-speaker review of Hindi (`hi`) and Tamil (`ta`) translations (D42) | **Owner** | Single-file workflow ready in `docs/review/TRANSLATIONS.csv` (`pnpm --dir frontend texts:export` / `texts:import`, NEX-094) |
| Payment gateways: Razorpay live webhook secret & Stripe EU test/live account (D62) | **Owner** | Razorpay INR payment links (`NEX-107`) verified live against Razorpay Test Mode API (`plink_U3WVITB4nOOJba`) and locally signed webhooks; connect a public webhook URL for live Razorpay delivery, and provide Stripe test credentials to build draft **NEX-138** (EU invoices) |
| Kubernetes cluster for live Helm chart install test (NEX-120) | **Owner** | `helm lint` and `helm template` pass; run `helm install` against a staging or Docker Desktop Kubernetes cluster when enabled |
| Presentation deck contact line (`docs/presentation/NexusCampus-Introduction.pptx`, NEX-093) | **Owner** | Replace the placeholder contact line on the closing slide with final company contact details before sharing externally |
| Production KMS auto-unseal for OpenBao & external penetration test | **Owner** / Ops | Documented in `deploy/compose/README.md`, `deploy/control/README.md`, and `docs/review/STAGE-2-SECURITY.md` |
