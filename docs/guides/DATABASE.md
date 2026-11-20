# Database

> State as of: 2026-11-20 (NEX-051) · Migration: `0008_access_grants`

PostgreSQL 16 with pgvector (D47). Migrations are hand-written Alembic files in `backend/migrations/versions/`;
`backend/tests/db/test_migrations.py` proves the SQLAlchemy models equal the migrated schema.

## Roles and tenant isolation
- **Owner** (`NEXUS_MIGRATE_DATABASE_URL`): runs migrations and the demo seed only.
- **`nexus_app`** (`NEXUS_DATABASE_URL`): the API's role — `LOGIN`, no superuser, **no `BYPASSRLS`**. Created by
  `0001_tenancy`; its password comes from `NEXUS_APP_DB_PASSWORD`. It may read and write tenant tables but cannot
  create or delete tenants (provisioning is Nexus Control, Stage 2).
- **Row-Level Security** is enabled and **forced** on every table below. Policy `tenant_isolation`:
  `tenant_id = current_setting('app.tenant_id', true)` (on `tenants`: `id = …`) for reads and writes. Without a
  tenant context no rows match.
- The tenant context is set per transaction with `set_config('app.tenant_id', <id>, true)` (= `SET LOCAL`) by
  `nexus.core.tenancy.tenant_transaction`, from the signed session — never from a request header.
- **Region pinning (G-5, D45):** a cell serves only tenants whose `tenants.region` equals `NEXUS_REGION`; others get
  `503 internal` (logged, region not revealed).

## Tables (M01 — `0001_tenancy`)

| Table | Key columns | Rules |
|---|---|---|
| `tenants` | `id`, `name`, `type`, `region` | One per customer (a standalone institution or a group); region fixed |
| `groups` | `id`, `tenant_id`, `name`, `region` | Unique (`id`, `tenant_id`) for composite foreign keys |
| `institutions` | `id`, `tenant_id`, `group_id`, `name`, `type`, `region`, `status`, `default_locale`, `supported_locales[]`, `time_zone`, `currency`, `country`, `weekend_days[]` | Group must be in the same tenant (FK `group_id, tenant_id`); default locale ∈ supported; ≥ 1 supported locale; weekend days 0–6; `updated_at ≥ created_at` |
| `campuses` | `id`, `tenant_id`, `institution_id`, `code`, `name`, `time_zone` (null = institution's), `address` (JSONB, organisation address) | Institution in the same tenant; `code` `^[A-Z0-9-]{1,16}$`, unique per institution |
| `academic_calendars` | `id`, `tenant_id`, `institution_id`, `academic_year`, `starts_on`, `ends_on`, `display_calendar`, `periods` (JSONB), `holidays` (JSONB) | Institution in the same tenant; `ends_on ≥ starts_on`; period overlap and holiday range are checked by the API (NEX-047) |

All tables carry `created_at` / `updated_at` (UTC, `timestamptz`). Ids are text: demo rows keep the mock ids
(`ten-ls`, `ins-rv`, …); new rows use `<prefix>_<ULID>` (`nexus.core.ids.new_id`).

## Audit and events (core — `0002_audit_outbox`)

| Table | Key columns | Rules |
|---|---|---|
| `audit_events` | `id`, `tenant_id`, `seq`, `occurred_at`, `actor_kind`, `actor_id`, `grant_id`, `action`, `module_id`, `target_type`, `target_id`, `device_id`, `changes` (JSONB: `[{field, sensitive}]` — names only, never values), `prev_hash`, `hash` | **Append-only:** `nexus_app` has SELECT + INSERT only; a trigger refuses UPDATE and TRUNCATE for every role, and DELETE unless the owner set `nexus.audit_maintenance = on` (dev seed reset only). Gapless `seq` per tenant; `grant_id` iff `provider_grant`; `actor_id` null iff `system`; `action` starts with its module |
| `audit_chain_heads` | `tenant_id`, `last_seq`, `last_hash` | Locked `FOR UPDATE` by every writer, so concurrent writes never fork the chain |
| `domain_events_outbox` | `event_id`, `tenant_id`, `module_id`, `event_type`, `occurred_at`, `actor_id`, `correlation_id`, `schema_version`, `payload` (JSONB), `published_at`, `attempts` | Envelope of `event.ts`; written in the same transaction as the change; published by workers (NEX-056) |

**Hash chain:** `hash = sha256_hex(id|occurredAt|action|prevHash)` with `occurredAt` as `2026-05-04T06:00:00Z` (milliseconds
only when not zero) and `prevHash` empty for the first row — the same input as the mocks, so seeded demo chains verify.
It covers ids and metadata only, never personal values. Write with `nexus.core.audit.record_audit` and
`nexus.core.events.emit_event` inside the tenant transaction; check with `nexus.core.hashchain.verify_chain`.

## Identity (M02 — `0003_identity`, D25, D44)

| Table | Key columns | Rules |
|---|---|---|
| `people` | `id`, `tenant_id`, `legal_name`, `preferred_name`, `date_of_birth`, `is_minor`, `email`, `phone`, `preferred_locale`, `retention_state` | One human per tenant; phone E.164; retention `active` / `archived` / `crypto_shredded` |
| `users` | `id`, `tenant_id`, `person_id`, `email`, `status`, `mfa_enabled`, `passkey_count`, `sso_only`, `last_sign_in_at`, `idp_subject` | Person in the same tenant; email unique per tenant (case-insensitive); `idp_subject` = Keycloak `sub`, pinned at first sign-in, unique per tenant. **No passwords** (Keycloak holds credentials) |
| `role_profiles` | `id`, `tenant_id`, `person_id`, `institution_id`, `campus_id`, `kind`, `academic_year_id`, `effective_from`, `effective_to`, `status` | Membership of an institution (staff / guardian / learner / alumni / external); `effective_to ≥ effective_from` |
| `guardian_links` (`0005`) | `tenant_id`, `guardian_person_id`, `learner_person_id` | Both people in the same tenant; a guardian sees their learners unmasked and as family (G-6) |
| `sso_providers` (`0006`) | `id`, `tenant_id`, `institution_id`, `protocol`, `name`, `issuer_url`, `client_id`, `domains[]`, `scim_enabled`, `enabled` | `https://` issuer only; ≥ 1 domain; never a secret |
| `scim_tokens` (`0006`) | `id`, `tenant_id`, `token_hash`, `created_at`, `revoked_at` | Only `sha256(secret)` stored; token `<tenant>.<id>.<secret>` |
| `sessions` | `id`, `tenant_id`, `user_id`, `device_id`, `device_label`, `auth_method`, `mfa_verified`, `ip_address`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `token_hash` | Only `sha256(token)` is stored; demo sessions have none (never usable). The app may insert and revoke, never delete |

## Permissions and module switches (`0004_rbac_entitlements`, V-1)

| Table | Key columns | Rules |
|---|---|---|
| `permissions` | `code`, `module_id`, `sensitive`, `description_key` | Global catalogue (no tenant); `code` = `<module>.<resource>.<action>`, in its module. App: read only. Equals `nexus.core.permissions.CATALOGUE` and the mocks (parity test) |
| `roles` | `id`, `tenant_id`, `name`, `system`, `allowed_scope_kinds[]` | **System roles are read-only** for `nexus_app` (trigger), custom roles editable (NEX-048) |
| `role_permissions` | `role_id`, `permission_code`, `tenant_id` | Role in the same tenant; permission must exist in the catalogue |
| `role_assignments` | `id`, `tenant_id`, `user_id`, `role_id`, `scope_kind`, `scope_target_id`, `academic_year_id`, `effective_from`, `effective_to`, `granted_by` | Scope group / institution / campus / department / class / own (`target` null iff `own`); only assignments in force today grant anything (D25) |
| `entitlements` | `tenant_id`, `module_id`, `enabled`, `source`, `expires_at` | Module switch: off, expired or missing = `403 module_disabled`; core modules always on; trials need `expires_at`. App: read + switch (NEX-055) |

Every endpoint is guarded by `nexus.core.permissions.require(permission, module)`: module switch first, then the
permission in some scope; services narrow to the scopes with `Grants.allows` / `Grants.scopes`. A route-walk test
fails any non-public endpoint without a guard.

## Keys and field encryption (M83 — `0007_vault_keys`, D46)

| Table | Key columns | Rules |
|---|---|---|
| `vault_keys` | `id`, `tenant_id`, `purpose`, `custody`, `status`, `vault_key_name`, `created_at`, `rotated_at` | One per tenant + purpose (tenant data / health / identity / finance); custody platform / BYOK / HYOK; metadata only — key material stays in Vault |

Sensitive fields are stored as `v1:<keyVersion>:<wrapped data key>:<nonce+ciphertext>` (`nexus.core.fieldcrypto`):
AES-GCM with a data key wrapped by the tenant's Vault Transit key `tenant-<tenant>-<purpose>`, the field path bound as
associated data. Exact-match search uses blind indexes (Vault HMAC). Destroying a tenant's keys (offboarding,
`destroy_tenant_keys`) makes those values unreadable; the audit chain still verifies.

## Provider access (M83 — `0008_access_grants`, V-3/V-5)

| Table | Key columns | Rules |
|---|---|---|
| `access_requests` | `id`, `tenant_id`, `staff_ref`, `staff_display_name`, `reason`, `modules[]`, `mode`, `duration_hours`, `status`, `requested_at`, `decided_at`, `decided_by` | 1–72 h; `decided_*` set exactly when not `pending`; the deny reason is not stored |
| `access_grants` | `id`, `tenant_id`, `request_id` (unique), `modules[]`, `mode`, `starts_at`, `ends_at`, `revoked_at` | ends after start, ≤ 72 h; revoked only inside its window |
| `break_glass_notices` | `id`, `tenant_id`, `category`, `approver_refs[2]`, `occurred_at`, `notified_at`, `report_url` | two different approvers; `nexus_app` may only read (created by the provider plane, Stage 2) |

All three use forced RLS (`tenant_isolation`). No grant row is ever deleted; grant credentials are not stored.

## Demo data
`uv run --project backend nexus-seed [--reset]` loads the five demo tenants (D16), their audit chains, identities, roles and module switches from
`backend/src/nexus/seed/demo_fixtures.json`, exported from the frontend mocks with
`pnpm --dir frontend --filter @nexus/mocks export:fixtures` (a mocks test fails when the file is stale). Upsert by
id; each tenant is written inside its own tenant context. `--reset` only with `NEXUS_ENVIRONMENT=dev`.
