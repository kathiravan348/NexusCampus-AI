# Stage 3 Security Review (NEX-199)

> State as of: 2026-11-26 · Covers the Stage 3 build: M08, M09, M12–M28 and M86 (migrations `0029`–`0039`), the
> public enquiry form (D79, D81), the demo seed (D85) and the rollover writes (D84).
> **Reviewer:** Claude self-review under D83 (Codex and Gemini were offline). Codex re-checks this note and the D83
> reviews when it is back (Owner item, `STAGE-3-RELEASE.md` §5).

## Vault & boundary rules (V-1 – V-7)

| Rule | What Stage 3 adds | Automated gate |
|---|---|---|
| **V-1** Zero standing access | Every new table has `tenant_id`, composite `(id, tenant_id)` foreign keys and the forced `tenant_isolation` RLS policy; the app role is neither superuser nor `BYPASSRLS`. Every new route goes through the core guard `require(permission, module)`; only the two public enquiry-form routes are unguarded, and they find the tenant from an unguessable form id through an id-only function. | `tests/security/test_no_access.py::test_V1_every_tenant_table_has_forced_rls` (walks all tenant tables, Stage 3 included), `test_V1_cross_tenant_rows_are_invisible_on_every_table`, `test_V1_rls_check_fails_when_a_policy_is_broken`, `test_V7_no_route_serves_tenant_records_without_a_tenant_guard` (allowlist: health, auth, SCIM, sessions, public enquiry form) |
| **V-2** Key custody & crypto-shred | Personal free-text columns are sealed with `FieldCipher` under the tenant key and carry a `^v1:` ciphertext CHECK: `learners.health_flags`, `learners.sensitive_custom_fields`, `guardian_relationships.court_order_note`, `applications.sensitive_answers`, `attendance_marks.note`, `leave_requests.reason`, `concessions.reason`, `fee_refunds.reason`, `mark_entries.remark`, `revaluation_requests.reason`, `report_cards.line_remarks`, `report_cards.overall_remark`, `issued_documents.revoked_reason`, `thread_messages.body`, `meeting_bookings.note`. All are listed in `ENCRYPTED_COLUMNS`, so tenant export reads them and key destruction makes them unreadable. The demo seed seals with the same cipher and creates keys only through the key service (D85). | `tests/security/test_no_access.py::test_V2_destroyed_tenant_key_makes_data_unreadable`, `tests/db/test_seed_stage3.py` (no plaintext in sealed columns), per-module `tests/db/m*` ciphertext checks |
| **V-3** Approved access grants | No change: provider grants still exclude M83 and end after ≤ 72 h; Stage 3 routes use the same guard, so a grant opens only the modules it names. | `test_V3_grant_is_scoped_audited_and_ends`, `test_V3_grant_longer_than_72_hours_is_impossible` |
| **V-4** Operate without reading | Reads of sensitive rows (health flags, custody notes, sensitive answers, messages, remarks) write a sensitive-read audit with ids only; logs carry ids, counts and outcomes. The public form logs no answers; its rate limits key on hashed client data (D81). | `test_V4_logs_carry_no_personal_data`; audit and masking checks in the module tests `tests/db/m12`–`m24` |
| **V-5** Break-glass & four-eyes | No change. Rollover confirm and roll-back are single-person staff actions inside the 14-day window and audited (D84); they change only status columns. | `test_V5_break_glass_needs_two_people_and_the_institution_sees_it`, `tests/db/m86` |
| **V-6** Self-hosted & request safety | The public enquiry endpoint has per-form and per-client rate limits counted before the form lookup, a honeypot, and fails closed when Valkey is down (D81); writes take `Idempotency-Key` through the core guard. Dev-only routes are not mounted in production. | `test_V6_dev_broker_is_not_mounted_in_production`, `tests/db/m12` public-form abuse tests |
| **V-7** Control metadata only | No Stage 3 data reaches Nexus Control. Portal homes and dashboards (M25–M28) return counts and aggregates only. | `test_V7_no_route_serves_tenant_records_without_a_tenant_guard`, `tests/db/m28` |

## Database grants (D84)

`nexus_app` gets column-level grants only where a write needs them. Rollover (`0039`) adds `SELECT, INSERT` on
`rollover_runs` and `promotion_decisions`, `UPDATE` on the run's status, counts and `rollback_until`, `UPDATE` on the
decision's action fields, `INSERT, DELETE, UPDATE (status, effective_to, updated_at)` on `enrolments` and
`UPDATE (status, left_on, updated_at)` on `learners`. No table gets a blanket `UPDATE`. **Owner:** review these
grants before release (`STAGE-3-RELEASE.md` §5).

## Cross-field rules left to the database

Contract parity (NEX-196) checks the response shape. The cross-field rules of 8 response models (date order, amount
sums, status/field pairs) are enforced by the services on write and by PostgreSQL CHECK constraints, so raw SQL and
migrations cannot break them either (`backend/tests/parity/contract_map.py` lists them).

## Open items (outside Stage 3 build scope)

- Codex re-check of every D83 self-review (NEX-185, 187–197, 203–208) and of this note.
- External penetration test of the public enquiry endpoint before a public SaaS launch.
- Carried over from Stage 2: production KMS auto-unseal for OpenBao; Stripe (NEX-138, D64).
