# Stage 1 — release checklist

> For the Owner's release approval (NEX-065). Filled on 2026-11-21 on the Owner PC (Windows 11, Docker Desktop,
> Node 24, Python 3.12) against `main` + `task/NEX-065`. Items marked **Owner** need a person, not a test.
>
> **Released: approved by the Owner on 2026-11-21 (D54).** The Hindi / Tamil native review is deferred to before
> production: the Owner corrects the texts from the single export file `docs/review/TRANSLATIONS.csv` (NEX-094).

## 1. Result at a glance

| Area | Result |
|---|---|
| No-access rules V-1…V-7 (release gates, must pass) | **Pass** — 17 tests, and the broken-RLS fixture turns the check red |
| Signed audit checkpoints | **Pass** — signature verifies with the real Vault; every kind of tampering is detected |
| Backend checks | **Pass** — `backend-check` 273 tests (format, lint, mypy strict, pytest) |
| Frontend checks | **Pass** — `review:check` (format, lint, typecheck, 160+ test files, build) 58.5s |
| Real-mode end to end (every Stage 1 screen) | **Pass** — 7 opt-in specs, real Keycloak + backend + database |
| Accessibility (WCAG 2.2 AA, axe) | **Pass** — every menu screen, light and dark, mock and real data |
| Languages en / hi / ta (D42) | **Pass** (automated); **Owner**: native-speaker review open |
| Performance budgets (soft) | **Pass** — API list p95 11–29 ms (budget 300 ms); 4G first load 2.18 s (budget 6 s) |
| Self-hosted install (NEX-064) | **Pass** — fresh install 74.9 s, upgrade and restart keep data |

## 2. No-access tests (V-1…V-7)

`uv run --project backend pytest backend/tests/security -v` — each test names its requirement.

| Rule | Tests | What is proven |
|---|---|---|
| V-1 Zero standing access | `test_V1_every_tenant_table_has_forced_rls`, `…_cross_tenant_rows_are_invisible_on_every_table`, `…_rls_check_fails_when_a_policy_is_broken`, `…_provider_without_a_grant_reaches_nothing`, `…_tenant_comes_from_the_session_never_from_a_header`, `…_minor_details_are_masked_without_restricted_access`, `…_disabled_module_is_closed_even_to_the_owner_and_a_grant` | All 41 tenant tables have forced RLS; no tenant sees another's rows; with no tenant the app role sees nothing; a forged provider credential gets 401/403 on every route; tenant headers are ignored; minors' details are masked; a switched-off module is closed |
| V-2 Vault and keys | `test_V2_destroyed_tenant_key_makes_data_unreadable`, `…_vault_and_health_modules_are_blocked_from_ai`, `…_ai_settings_never_unblock_vault_or_health` | Crypto-shred works; vault (M83) and health (M61) data never reach the AI index or settings |
| V-3 Access grants | `test_V3_grant_is_scoped_audited_and_ends`, `…_grant_longer_than_72_hours_is_impossible` | A grant reaches only its modules, every use is audited as the grant, it ends by itself; > 72 h is refused by the database |
| V-4 Operate without reading | `test_V4_logs_carry_no_personal_data` | Sign-in, directory reads and a write log no e-mail addresses or names |
| V-5 Break-glass | `test_V5_break_glass_needs_two_people_and_the_institution_sees_it` | Two distinct approvers and notification after the event are enforced by the database |
| V-6 Self-hosted, no network path | `test_V6_install_publishes_only_loopback_ports_and_never_vault`, `…_dev_broker_is_not_mounted_in_production` | Only the app and sign-in pages are published, on 127.0.0.1; database, cache, Vault and API are not; the provider stand-in is absent in production |
| V-7 Control stores only metadata | `test_V7_no_route_serves_tenant_records_without_a_tenant_guard` | Every data route needs a tenant session or grant; Nexus Control itself is Stage 2 |

Broken-RLS proof: the fixture replaces `campuses`' policy with `USING (true)` inside a rolled-back transaction; the
same V-1 check then reports `["campuses"]`.

## 3. Signed audit checkpoints

- Once a UTC day the worker signs each tenant's chain head with the Ed25519 Vault key `nexus-audit-checkpoints`
  (`nexus-checkpoints` runs it by hand). It refuses to sign a chain that does not verify.
- Dev run against the real Vault: 2 tenants signed (India cell), re-run signs 0 (one per day); verification of Little
  Steps (287 events) and Apex (24 events): signature valid, head matches.
- `backend/tests/test_checkpoints.py` (each on its own database): signature verifies and is daily; an edited row
  before or after a checkpoint is detected (and the job refuses to sign); a fully rewritten chain is caught by the
  signed head; an edited checkpoint fails its signature; the job signs each tenant once and RLS hides other tenants'
  checkpoints; the API lists and verifies.
- API: `GET /api/v1/audit-checkpoints` and `/audit-checkpoints/verify` (`m06.audit.read`), see `docs/guides/API.md`.

## 4. Accessibility and languages

| Check | Command | Result |
|---|---|---|
| axe, every screen, light + dark, mock data | `pnpm --dir frontend e2e` (a11y ×4) | Pass (NEX-021, unchanged) |
| axe WCAG 2.0/2.1/2.2 A+AA, every menu screen, light + dark, real data | `pnpm --dir frontend e2e:real a11y.spec.ts` | Pass, no serious or critical violations |
| Tamil on every screen (Apex, real data) | `e2e:real languages.spec.ts` | Pass: `lang="ta-IN"`, Tamil headings, no raw keys |
| Hindi on every screen (Little Steps turns Hindi on, real data) | `e2e:real languages.spec.ts` | Pass: Hindi headings, no raw keys, back to English |
| Hindi / Tamil default tenants, pseudo-locale, RTL (mock) | `pnpm --dir frontend e2e` | Pass (NEX-021/040) |
| **Owner:** native-speaker review of every Hindi and Tamil text (D42) | person | **Deferred to before production** (D54) — Owner corrects via the text export (NEX-094) |

## 5. Performance (soft budgets, `docs/TIMINGS.md`)

| Key | Measured | Budget |
|---|---|---|
| `api:list:p95` (24 list endpoints × 20 calls, demo data) | 11–29 ms (slowest single endpoint `usage` 39 ms) | 300 ms |
| `load:4g` (built app, cold, 150 ms RTT, 1.6 Mbit/s) | 2.18 s, 322 KiB | 6 s |
| `review:check` | 58.5 s | 7 min |
| `backend:check` | ~38 s | 3 min |
| `compose:up` self-hosted install | 74.9 s fresh, 17.3 s re-run | 1 min 30 s |

## 6. How to repeat the real-mode runs

1. `uv run --project backend nexus-compose-up`, then `alembic upgrade head`, `nexus-seed`, `nexus-keycloak-dev`,
   `nexus-vault-dev` (backend folder).
2. `uv run --project backend nexus-dev` and `pnpm --dir frontend dev:real` (port 3100).
3. For the 4G check: `pnpm --dir frontend --filter campus real:build` and `real:preview` (port 3101).
4. `NEXUS_E2E_EMAIL=<a seeded admin> NEXUS_E2E_PASSWORD=<NEXUS_DEMO_USER_PASSWORD from backend/.env>
   pnpm --dir frontend e2e:real` (runs one spec at a time).

## 7. Definition of done (AGENTS.md §9) for Stage 1

- [x] Acceptance checks of NEX-047…NEX-065 pass (each task file's Review section)
- [x] `review:check` and `backend-check` pass
- [x] Stories at 360px and desktop, light and dark, pseudo-locale and RTL (Stage 1 component tasks)
- [x] No hardcoded text, colours or font names (lint rules); offline levels met (NEX-040, NEX-062)
- [x] Maps and guides updated (STRUCTURE, CONTRACTS, API, DATABASE, USER-GUIDE)
- [x] Timings recorded (`docs/TIMINGS.md`)

## 8. Open before or at release (Owner / planner)

| Item | Who | Note |
|---|---|---|
| Native-speaker review of hi / ta texts (D42) | **Owner** | Deferred to before production (D54) |
| Release approval and `docs/tasks/BOARD.md` stage switch | **Owner** / planner | **Done** — approved 2026-11-21 (D54) |
| SSO client secrets storage | Planner | Decision pending (NEX-049) |
| AI tier → model map and embedding model sign-off | Planner | Pending (NEX-058); real e2e never calls a paid model |
| `boto3` in the SaaS image for Bedrock embeddings | Planner | Needed only for the Bedrock path |
| Vault auto-unseal (KMS) for real installs, image registry / release pipeline | Stage 2 | Documented in `deploy/compose/README.md` |
| Third-party penetration test | Out of scope | Stage 2 |
