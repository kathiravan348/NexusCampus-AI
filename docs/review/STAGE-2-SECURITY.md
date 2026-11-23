# Stage 2 Security Review (NEX-110)

> State as of: 2026-11-23 · Covers Nexus Control (P01–P18), M84 install agent, D60 command channel, D61 offboarding &
> moves, D62 Razorpay payments, and OpenBao key custody (`deploy/compose` and `deploy/control`).

## Vault & boundary rules (V-1 – V-7)

| Rule | Guarantee | Automated gate / change |
|---|---|---|
| **V-1** Zero standing access | No Control module imports product DB, tenancy, or tenant tables; every Control route is guarded by staff permission/session, agent bearer token, HMAC webhook signature, or the 6-route public allowlist; partner users see only their accounts' rows. | `tests/security/test_control_no_access.py::test_V1_no_control_code_connects_to_product_database`, `test_V1_every_control_route_is_guarded`, `test_V1_broken_guard_fixture_fails_the_route_walk` (proves gate fails on an unguarded route), `test_V1_partner_scoping_on_every_control_list` |
| **V-2** Key custody & crypto-shred | Product `nexus-app` and Control `nexus-control` OpenBao policies explicitly deny `transit/export/*`; signing keys (`nexus-licence`, `nexus-release`, `nexus-command`, `nexus-shred`) are `exportable=false`; both Compose install scripts revoke the OpenBao root token immediately after setup and strip it from disk (`bao operator generate-root` documented in both READMEs). | `deploy/{compose,control}/scripts/install.{sh,ps1}`, `tests/security/test_command_channel.py::test_V2_openbao_policies_deny_export_and_revoke_root`, `tests/db/test_tenant_offboarding_commands.py`, `tests/db/control/test_offboarding_writes.py` |
| **V-3** Approved access grants | Provider access requests cross Control → cell via signed `access_request.file` commands; M83 always refuses `M83` in scope; decisions sync back as ids/statuses/times only. | `tests/db/control/test_broker_api.py`, `tests/db/test_agent_broker.py`, `tests/security/test_no_access.py::test_V3_*` |
| **V-4** Operate without reading | Health check-ins, updates, move commands, and Control logs carry ids, counts, timings, and outcomes only — never learner/family records, PEMs, or secrets. | `tests/security/test_control_no_access.py::test_V4_V7_control_logs_carry_no_secrets_or_personal_data`, `tests/db/control/test_razorpay_payments.py` |
| **V-5** Break-glass & four-eyes | Break-glass cases and P04 key destruction both enforce two distinct staff approvers at API, DB CHECK, and cell-agent layers. | `tests/db/control/test_offboarding_writes.py`, `tests/db/test_tenant_offboarding_commands.py`, `tests/security/test_control_no_access.py::test_V7_control_models_enforce_cross_field_rules` |
| **V-6** Self-hosted & request safety | Control never connects to deployments (pull-only signed D60 commands); forged, tampered, replayed, expired, foreign-deployment, and unknown-kind commands never execute; stolen deployment tokens get `404` on foreign commands; air-gapped installs make zero outbound requests (`403` on Control). Staff session cookie uses `HttpOnly`, `Secure` (prod), `SameSite=Strict`, `Path=/control`; browser writes enforce `Origin == NEXUS_CONTROL_APP_PUBLIC_URL` (`403` otherwise); API responses set `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and HSTS in prod. | `tests/security/test_command_channel.py`, `tests/security/test_control_no_access.py::test_V6_request_safety_origin_cookies_and_security_headers`, `control/{auth,main}.py` |
| **V-7** Control metadata only | Schema walk confirms zero learner/family/health/safeguarding/ID/card columns in Control tables (only allowlisted `account_contacts`, `staff_users`, `deployment_commands.payload`, and non-medical `accounts.health_score` / `deployments.health`); all 46 Control response models enforce frozen Zod cross-field rules (`model_validator`s), verified strictly (`expected = case["valid"]`) in `tests/parity/test_control_parity.py`. | `tests/security/test_control_no_access.py::test_V7_control_schema_holds_no_institution_personal_data`, `test_V7_control_models_enforce_cross_field_rules`, `tests/parity/test_control_parity.py` |

## Cross-field rules left to the database

- **Uniqueness & foreign-key integrity** (`accounts.id`, `invoices.number`, `deployment_commands.id`, `payment_links.gateway_link_id`, `approver_1_staff_id <> approver_2_staff_id` on `offboarding_jobs`): enforced by PostgreSQL UNIQUE / FK / CHECK constraints inside the write transaction because cross-row uniqueness cannot be validated on a single Pydantic model instance.
- **Step-state atomicity across commands and linked jobs** (`control_job_steps_valid` SQL function): enforced both in Pydantic (`ProvisioningJob`, `OffboardingJob`, `PortabilityJob`) and in PostgreSQL CHECK constraints so raw SQL / migrations cannot violate step invariants either.

## Live Compose key-custody verification

- **`deploy/compose` (product):** fresh `install.ps1` (`93.10s`) created `vault-init.json` without `root_token` (`HAS_ROOT_TOKEN=False`), `NEXUS_VAULT_TOKEN` created & encrypted with `smoke-k1` (`exit 0`), `transit/export/encryption-key/smoke-k1` returned `permission denied` (`exit 2`), idempotent re-run succeeded without root token (`8.78s`, `exit 0`); torn down with `down -v`.
- **`deploy/control` (Control):** fresh `install.ps1` (`60.83s`) created `.env.vault-init.json` without `root_token` (`CTRL_HAS_ROOT_TOKEN=False`), `NEXUS_VAULT_TOKEN` signed with `nexus-licence`, `nexus-command`, `nexus-shred` (`exit 0`), `transit/export/signing-key/nexus-licence` returned `permission denied` (`exit 2`), idempotent re-run succeeded without root token (`22.77s`, `exit 0`); torn down with `down -v`.

## Open items (outside Stage 2 build scope)

- External third-party penetration test before public SaaS launch.
- Production KMS auto-unseal for OpenBao (replaces file-stored unseal key in `vault-init.json` / `.env.vault-init.json`).
- Stripe EU payment gateway (NEX-138) moved to a later stage (D64); D62's rules (hosted page, signed webhooks, no card data) apply when it is built.
