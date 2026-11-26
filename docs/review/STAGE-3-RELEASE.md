# Stage 3 — release checklist

> **Released 2026-11-26 — approved by the Owner (D86).** Open Owner items before the first production customer: §5.

> For the Owner's release review (NEX-199). Filled on 2026-11-26 on the Owner PC (Windows 11, Docker Desktop, Node 24,
> Python 3.12, PostgreSQL 16, OpenBao, Valkey, Keycloak) against `main` after NEX-197. Items marked **Owner** need a
> person, not a local test.
> Built, planned and reviewed by Claude alone under D83 while Codex and Gemini were offline (weekly limits). Codex
> re-checks the D83 reviews when it is back (§5).

## 1. Result at a glance

| Area | Result |
|---|---|
| Security rules V-1…V-7 | **Pass** — see [`STAGE-3-SECURITY.md`](STAGE-3-SECURITY.md): forced RLS on every Stage 3 table, route-guard walk, 15 sealed personal columns, no personal data in logs |
| Contract parity (API responses ⇄ frozen Zod, NEX-196) | **Pass** — 64 Stage 3 contracts; shape checked, cross-field rules in services and DB CHECKs |
| Backend checks (`backend-check`, database required) | **Pass** — ruff format, ruff lint, mypy `--strict`, pytest: 669 passed (database tests not skipped) |
| Frontend checks (`review:check`) | **Pass** — format, lint, typecheck, Vitest (2047 tests), production + Storybook builds |
| Real backend serves every mock route | **Pass** — all 126 mock API routes exist on the real API |
| Stage 3 screens on real data (`e2e/real/stage3.spec.ts`, NEX-197) | **Pass** — admin, teacher and guardian open every menu screen through Keycloak sign-in: no 5xx, no 403, no error heading |
| Real-mode accessibility (WCAG 2.2 AA, axe) | **Pass** — every screen in light and dark, 0 serious/critical issues |
| Real-mode languages en / hi / ta (D42) | **Pass** (automated: Tamil and Hindi, no raw or missing keys); **Owner**: native-speaker review of the new texts |
| Browser checks on demo data (`pnpm --dir frontend e2e`) | **Pass** — 70 passed; the 3 "every screen" a11y tests hit the 60 s test timeout only under full-suite load and pass alone (desktop 2/2, mobile-360 2/2) |
| Demo seed (D85) | **Pass** — dev database upgraded `0022` → `0039` and seeded live through OpenBao; sealed columns hold ciphertext only; second run changes nothing |
| Packaging: install / upgrade / backup with migrations `0029`–`0039` | **Owner** — not re-run in Stage 3 (`deploy/` unchanged; new migrations ran on the dev database and in every test database) |

## 2. Stage 3 build tasks

| Module | Build tasks | Tests |
|---|---|---|
| M08 configuration, M15 academic structure | NEX-200, NEX-183 | `tests/db/m08`, `m15` |
| M13 learners, M14 families | NEX-184, NEX-202 | `tests/db/m13`, `m14` |
| M12 admissions + public form, M09 import | NEX-185, NEX-204, NEX-186, NEX-201, NEX-203 | `tests/db/m12`, `m09` |
| M16 timetable, M17 attendance | NEX-187, NEX-205 | `tests/db/m16`, `m17` |
| M18 fees, M19 accounting | NEX-188, NEX-206 | `tests/db/m18`, `m19` |
| M20 gradebook, M21 exams | NEX-189, NEX-207 | `tests/db/m20`, `m21` |
| M22 report cards, M23 documents | NEX-190 | `tests/db/m22` |
| M24 messages, notices, meetings | NEX-191 | `tests/db/m24` |
| M25–M28 portal homes and dashboards | NEX-192 | `tests/db/m28` |
| M86 rollover (Owner review point 3, D84) | NEX-208, NEX-193, NEX-194 | `tests/db/m86`, `RolloverWrites.test.tsx` |
| Demo seed, parity, real data | NEX-195, NEX-196, NEX-197 | `test_seed_stage3.py`, `tests/parity`, `e2e/real/stage3.spec.ts` |

NEX-198 and NEX-209 were withdrawn (done inside NEX-197 and NEX-195).

## 3. How the real-data run was done

The backend ran on port 8010 because port 8000 belongs to another project on this PC (`NEXUS_PORT`,
`NEXUS_API_PUBLIC_URL`; the Vite proxy reads `NEXUS_API_URL`). For that run only, the local dev Keycloak client got
the redirect `http://127.0.0.1:8010/api/v1/auth/callback` at runtime; it is not in the realm export. The demo password
was read from `backend/.env` into the environment and never printed or committed.

## 4. Fixes found by the release runs

- Guardian `/devices` returned 403 from the device heartbeat: the heartbeat now registers only with `m10.device.read`.
- Forms seed upsert by institution (`0029` may already have created the institution's public form).
- `check-main` format failure after NEX-196 (`ruff format`, `review:` commit).

## 5. Owner items before release

1. Native-speaker review of the new Hindi and Tamil texts (`TRANSLATIONS.md`).
2. Install / upgrade / backup test of the Compose images with migrations `0029`–`0039`.
3. Review the D84 column grants (`STAGE-3-SECURITY.md`, "Database grants").
4. Codex re-check of the D83 self-reviews (NEX-185, 187–197, 203–208) when its limit resets.
5. Decide whether the 8010 Keycloak redirect stays in the local dev realm (it is runtime-only now).
6. D82 (scheduler fallback build) and D83 (solo Claude) are recorded in `DECISIONS.md`; the scheduled task stays off.
