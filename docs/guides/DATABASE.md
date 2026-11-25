# Database

> State as of: 2026-11-25 (Stage 3 build, M12 staff admissions, NEX-185) · Migrations: product `0028_admissions`, Nexus Control
> `c0021_payment_links`

PostgreSQL 16 with pgvector (D47). Migrations are hand-written Alembic files in `backend/migrations/versions/`;
`backend/tests/db/test_migrations.py` proves the SQLAlchemy models equal the migrated schema.

## Roles and tenant isolation
- **Owner** (`NEXUS_MIGRATE_DATABASE_URL`): runs migrations and the demo seed only.
- **`nexus_app`** (`NEXUS_DATABASE_URL`): the API's role — `LOGIN`, no superuser, **no `BYPASSRLS`**. Created by
  `0001_tenancy`; its password comes from `NEXUS_APP_DB_PASSWORD`. It may read and write tenant tables but cannot
  create or delete tenants: a SaaS cell's install agent creates them with the owner role on a signed command from
  Nexus Control (`tenant.provision`, NEX-127).
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
| `audit_checkpoints` (`0016_audit_checkpoints`, NEX-065) | `id`, `tenant_id`, `day`, `head_seq`, `head_hash`, `signature` (`vault:v<N>:…`), `key_name`, `signed_at` | One per tenant per UTC day (UNIQUE); `nexus_app` SELECT + INSERT only. `nexus_audit_tenants()` (SECURITY DEFINER) gives the job tenant ids only. Ed25519 signature over the chain head, key in Vault |
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

## Privacy (M06 — `0009_privacy`, G-6)

| Table | Key columns | Rules |
|---|---|---|
| `consents` | `id`, `tenant_id`, `person_id`, `purpose`, `status`, `given_by_person_id`, `method`, `recorded_at`, `withdrawn_at` | `withdrawn_at` set exactly when withdrawn, not before `recorded_at` |
| `data_subject_requests` | `id`, `tenant_id`, `person_id`, `kind`, `status`, `received_at`, `due_at`, `completed_at`, `handled_by`, `rejection_reason` | due after received; `completed_at` set exactly when completed or rejected; reason only when rejected |
| `tenant_compliance` | `tenant_id`, `pack_code` (PK) | Which packs a tenant follows; the app only reads it. Pack rules live in code (`m06/packs.py`, = mock fixtures) |

All three use forced RLS (`tenant_isolation`).

## Themes and fonts (M03 — `0010_themes_fonts`, C-1, D28/D29)

| Table | Key columns | Rules |
|---|---|---|
| `themes` | `id`, `tenant_id`, `scope_kind`, `scope_target_id`, `light`/`dark`/`radius` (JSON token maps), `fonts`, `density`, `assets` (JSON), `locked_tokens[]`, `version`, `updated_by`, `updated_at` | One layer per tenant + scope; `scope_target_id` NULL only for `platform`; forced RLS |
| `fonts` | `id`, `tenant_id` (NULL = shared library), `family`, `source`, `roles[]`, `scripts[]`, `file_url` | Library fonts are visible to every tenant, uploads (Stage 3) only to their own; the app only reads |

## Text overrides (M04 — `0011_text_overrides`, C-2, D28)

| Table | Key columns | Rules |
|---|---|---|
| `text_overrides` | `id`, `tenant_id`, `scope_kind`, `scope_target_id`, `locale`, `key`, `message`, `version`, `updated_by`, `updated_at`, `deleted_at` | One per tenant + scope + locale + key; a delete sets `deleted_at` (id and history kept); forced RLS |
| `text_override_revisions` | `override_id` + `version` (PK), `tenant_id`, `message` (NULL = deleted), `changed_by`, `changed_at` | Append-only for the app (SELECT, INSERT); rollback reads from here |

## Plans and usage (M05 — `0012_plans_usage`)

| Table | Key columns | Rules |
|---|---|---|
| `plans` | `id`, `code` (unique), `name_key`, `modules[]`, `ai_credits_per_month`, `learner_limit` | Platform reference data, no tenant column; the app only reads (changes: Nexus Control, Stage 2) |
| `tenant_plans` | `tenant_id` (PK), `plan_id` | A tenant's plan; forced RLS; read-only for the app |
| `usage_meters` | `tenant_id` + `metric` + `period_start` (PK), `period_end`, `used`, `limit` | Stored counters per period; forced RLS |

## Notifications (M07 — `0013_notifications`, G-1)

| Table | Key columns | Rules |
|---|---|---|
| `notification_templates` | `id`, `tenant_id`, `event_type`, `channel`, `locale`, `subject`, `body`, `version`, `enabled`, `updated_at` | One per tenant + event + channel + locale; `subject` only for email |
| `notification_deliveries` | `id`, `tenant_id`, `template_id`, `recipient_person_id`, `channel`, `status`, `reason`, `queued_at`, `sent_at`, `event_id` | Unique `event_id` + person + channel (each event delivered once); `reason` exactly for failed / suppressed |
| `notification_preferences` | `id`, `tenant_id`, `user_id`, `channel`, `event_type` (NULL = all), `enabled`, `quiet_start`, `quiet_end`, `time_zone` | One per user + channel + event (NULLs not distinct) |
| `idempotency_keys` | `tenant_id` + `key` (PK), `user_id`, `request_hash`, `status_code`, `response` | Offline replays; append-only for the app |

All four use forced RLS. `domain_events_outbox` gained `next_attempt_at` and `last_error` (retries with backoff).
`nexus_outbox_tenants()` (SECURITY DEFINER) returns only the ids of tenants with due events, so the worker stays
`nexus_app` under RLS and processes one tenant transaction at a time.

## Sync (M10 — `0014_sync`, O-2/O-3)

| Table | Key columns | Rules |
|---|---|---|
| `devices` | `id`, `tenant_id`, `user_id`, `label`, `platform`, `last_sync_at`, `pending_count`, `conflict_count`, `lost_write_count`, `status`, `revoked_at` | `revoked_at` exactly when revoked; counts ≥ 0 |
| `sync_conflicts` | `id`, `tenant_id`, `device_id`, `module_id`, `operation`, `merge_rule`, `summary_key`, `client_version`, `server_version`, `status`, `resolution`, `created_at`, `resolved_at` | No payload column (privacy); `resolution` / `resolved_at` exactly when resolved |

Both use forced RLS. `idempotency_keys.response` is now nullable (a claimed key has `status_code = 0` until its
response is stored); the app may update and delete its keys.

## AI (M11 — `0015_ai`, D47)

| Table | Key columns | Rules |
|---|---|---|
| `ai_settings` | `tenant_id` (PK), `enabled`, `modules` (JSON), `blocked_modules[]`, `safeguarding_enabled`, `default_tier`, `provider_kind`, `provider_label`, `updated_at` | `blocked_modules` always holds M61 and M83 (CHECK); no keys |
| `ai_credits` | `tenant_id` + `period_start` (PK), `period_end`, `granted`, `used`, `hard_cap` | Under a hard cap `used ≤ granted` (CHECK) |
| `ai_answer_log` | `id`, `tenant_id`, `user_id`, `locale`, `tier`, `model`, `outcome`, `source_count`, `credits_used`, token counts, `created_at` | Metadata only — never question or answer text; append-only |
| `ai_chunks` | `id`, `tenant_id`, `module_id`, `record_type`, `record_id`, `label`, `locale`, `content`, `embedding vector(1024)` | Never M61 / M83 (CHECK); one chunk per record + locale |

All four use forced RLS; the `vector` extension is created by the migration (pgvector image). The dev seed indexes
institution settings and calendars with the deterministic dev embedder.

## Install agent (M84 — `0017`–`0020`, NEX-105, NEX-112, NEX-114, NEX-129)

Install-wide tables (no `tenant_id`, no RLS) holding versions, counts and file names only — never institution data
(V-7).

| Table | Key columns | Rules |
|---|---|---|
| `install_status` (`0017`) | `id` (always 1), `install_id`, `version`, `channel`, `licence` (JSON), `licence_problem`, `air_gapped`, `telemetry_enabled`, `last_update_check_at`, `last_backup_at`, `update_offer` (JSON), `checked_at` | One row (CHECK `id = 1`); air-gapped means no telemetry and no online update check (CHECK) |
| `install_backups` (`0018`) | `id`, `kind` (`backup` / `tenant_export`), `status`, `encrypted`, `size_bytes`, `started_at`, `finished_at`, `file_name` | Always encrypted (CHECK); finished iff not running; size when done |
| `install_diagnostics` (`0018`) | `id`, `status` (`generating` → `ready_for_review` → `approved` → `sent` / `discarded`), `scrubbed`, `size_bytes`, `ticket_ref`, `created_at`, `reviewed_by`, `sent_at`, `file_name` | Always scrubbed of personal data (CHECK); approved or sent needs a reviewer; `sent_at` iff sent |
| `agent_commands` (`0020`) | `id` (Control's `cmd-…`), `kind`, `received_at`, `status` (`running` / `done` / `failed` / `rejected`), `finished_at` | The replay guard for signed Control commands (D60): an id is inserted before the command runs, so it never runs twice; finished iff not running |
| `broker_reports` (`0021`) | `request_id`, `last_status`, `reported_at` | Which M83 decisions on command-filed access requests were already reported to Control (NEX-131); `reported_at` iff `last_status` |

`nexus_app` may read, insert and update these tables. Three owner-owned `SECURITY DEFINER` functions give it one
narrow capability each: `nexus_install_entitle()` switches on the core `M84` module for the tenant in context
(`0017`); `nexus_install_active_users(since)` returns one install-wide count of active users for health reports
(`0019`); `nexus_broker_request_statuses(ids)` returns only request id, status and decision time for command-filed
access requests (`0021`) — never reason, modules or people.

## Tenant freeze (M01 — `0022_tenant_freeze`, D61, NEX-133)

`tenants.frozen_at` (nullable): set once by the owner role when an institution is offboarded or moved. A frozen tenant
refuses every write with `423 tenant_frozen` (one shared guard in `tenant_transaction(write=True)`, used by API writes,
SCIM, provider access and the outbox worker); reads, the export and the daily audit checkpoint keep working. `nexus_app`
has column `UPDATE` on `tenants (name, type, region, updated_at)` only, so the app can never unfreeze a tenant.

## Academic structure (M15 — `0024_academic_structure`)

Each table has an opaque primary key `id`, a required `tenant_id` and forced tenant isolation. Foreign keys include the tenant when referencing tenant-owned rows. The app can read all five tables and insert class groups. Programs, class groups, subjects and offerings also store UTC `created_at` and `updated_at`.

| Table | Academic columns | Rules |
|---|---|---|
| `programs` | `institution_id`, `code`, `name`, `kind`, `duration_years`, `active` | Unique code per institution. Duration is 1–10 years or NULL for a rolling course. |
| `year_levels` | `program_id`, `code`, `name`, `order` | Code and positive ordinal are each unique within a program. |
| `class_groups` | `institution_id`, `campus_id`, `academic_year_id`, `program_id`, `year_level_id`, `kind`, `code`, `name`, `capacity`, `homeroom_staff_profile_id` | Unique code per academic calendar. The program determines the institution. An optional year level must belong to the program. Campus, staff profile and capacity (1–2000) are nullable. |
| `subjects` | `institution_id`, `code`, `name`, `kind`, `credits`, `active` | Unique code per institution. Credits are NULL or 0–60 in half-credit increments. |
| `subject_offerings` | `academic_year_id`, `period_id`, `class_group_id`, `subject_id`, `staff_profile_ids[]`, `weekly_periods` | The class group belongs to the academic year. A NULL period covers the whole year. Up to ten distinct staff IDs. Weekly periods are NULL or 0–60. |

Academic code uniqueness is case-insensitive. Migration `0023_stage3_access` adds the Stage 3 permission catalogue. Demo seeding applies the exported system-role grants and module entitlements to each demo tenant. Academic tables start empty.

## Forms and fields (M08 — `0025_configuration`)

All four tables have an opaque primary key `id`, a foreign key `tenant_id` to `tenants.id`, a unique `(id, tenant_id)` pair for tenant-bound references, and a UTC `updated_at`. Field, form and workflow definitions also record `created_at`. Each table enables and forces the `tenant_isolation` policy. The `nexus_app` role can select from all four tables and insert custom field definitions.

| Table | Configuration columns | Rules |
|---|---|---|
| `custom_field_definitions` | `entity`, `key`, `label`, `type`, `required`, `sensitive`, `options`, `min`, `max`, `order`, `archived` | Keys are unique per tenant and entity, including archived rows. Localized labels and choice options use JSONB. Only numeric fields have bounds. |
| `form_definitions` | `entity`, `name`, `field_keys`, `public`, `published` | The ordered field keys use a JSONB array. Only enquiry and application forms may be public. |
| `workflow_definitions` | `subject`, `name`, `steps`, `active` | The JSONB array stores 1–10 ordered approval steps with role IDs, optional escalation and response times. |
| `numbering_formats` | `subject`, `pattern`, `resets_yearly`, `next_sequence` | The next sequence is a positive integer. |

## Learner records (M13 — `0026_learner_records`)

All three tables have an opaque primary key, forced tenant RLS and the `tenant_isolation` policy. The application role has SELECT access only. References to institution records include the tenant ID.

| Table | Contents and rules |
|---|---|
| `learners` | Institution, optional campus, person and matching role profile, learner number, admission and departure dates, status, retention state and UTC creation and update times. A departure date is required for withdrawn, transferred, graduated and alumni learners. |
| `enrolments` | Learner, academic year, program, optional year level, class group, optional roll number, status, effective dates and UTC creation and update times. The year level belongs to the referenced program and the class group to the academic year. |
| `learner_documents` | Learner, document kind, plain file name, MIME type, size in bytes, verification flag, verifying staff profile and UTC upload time. A verified document requires a verifier. The table holds metadata only. |

The `learners.health_flags` column holds an encrypted JSON array under the tenant's `field_health` key. The `learners.sensitive_custom_fields` column holds an encrypted JSON object under its `tenant_data` key. Each ciphertext is bound to its qualified column name. NULL represents an empty collection. Other values use the `custom_fields` JSONB object. The database rejects learner writes that put a field marked sensitive for learners in that object. Tenant export unwraps both encrypted columns inside the encrypted export stream.

## Families and guardians (M14 — `0027_families`)

The three tables use forced tenant RLS with the `tenant_isolation` policy. The application role has SELECT access. Each scalar person reference includes the tenant ID in its foreign key to `people`.

| Table | Columns | Constraints |
|---|---|---|
| `households` | `id`, `tenant_id`, `name`, nullable JSONB `address`, `learner_person_ids[]`, `guardian_person_ids[]`, nullable `primary_language`, `created_at`, `updated_at` | Each list contains distinct person IDs. A household has 1–20 learners and up to 10 guardians. An address requires a street line, city and country code. The second line, region and postal code are optional. Primary language accepts the same locale shape as M01. |
| `guardian_relationships` | `id`, `tenant_id`, `guardian_person_id`, `learner_person_id`, `kind`, `parental_responsibility`, `lives_with_learner`, `contact_priority`, `pickup_right`, `court_order_note`, `effective_from`, `effective_to`, timestamps | Distinct guardian and learner. Priority is 1–10. A court restriction requires a note, encrypted under the tenant data key with `guardian_relationships.court_order_note` as its field path. All other rights require a null note. |
| `authorised_pickups` | `id`, `tenant_id`, `learner_person_id`, `name`, E.164 `phone`, `relationship_label`, `valid_from`, `valid_to`, `added_by_person_id`, `created_at` | Each pickup names the person who added it. |

Relationship and pickup end dates are optional and must be on or after their start dates. Household and relationship update times must be on or after creation. Family visibility uses the existing M02 guardian links.

## Staff admissions (M12 — `0028_admissions`)

All four tables have an opaque `id`, a `tenant_id`, an insertion-order column for stable paging, and forced RLS with the `tenant_isolation` policy. The application role can read all four tables and insert enquiries. Scalar references include the tenant ID.

| Table | Columns and constraints |
|---|---|
| `enquiries` | Institution, optional campus, program and assigned staff profile, source, contact name, phone, email, learner name, follow-up date, campaign code, status, lost reason and timestamps. At least one contact method is required. Email addresses are limited to 254 characters. A lost enquiry requires a nonblank reason. Other statuses require a null reason. |
| `applications` | Institution, optional enquiry, application number, form, academic year, program, optional year level, applicant person, up to four distinct guardian person IDs, answers, up to 30 distinct document IDs, status, submission, decision and creation/update times. All statuses except draft require submission time. Offered, waitlisted, accepted, rejected and enrolled require decision time. |
| `admission_offers` | Application, optional class group, expiry date, status, response time and creation time. Only accepted and declined offers have a response time, which is required for both. |
| `waitlist_entries` | Application, program, position and time added. Positions start at one and are unique within the tenant and program. |

Ordinary application values are stored in the `answers` JSONB object. A database trigger rejects plaintext keys marked sensitive for applications in that tenant. Protected values are a JSON object encrypted with FieldCipher in `sensitive_answers`, bound to `applications.sensitive_answers` under the tenant's `tenant_data` key. NULL means there are no protected answers. Tenant export unwraps this column inside the encrypted export stream.

### Public enquiry forms (`0029_enquiry_forms`)

`enquiry_forms` holds one public form per institution: `id` (`pef-` + ULID, 80 random bits from `secrets`),
`tenant_id`, `institution_id` (composite reference, unique) and `created_at`. Forced RLS with `tenant_isolation`;
the application role can only read it. The migration backfills one form per existing institution. New institutions
get a form with the demo data (NEX-195). `nexus_public_enquiry_form(form_id)` is an owner-owned SECURITY DEFINER
function (`SET search_path = public`, no `PUBLIC` execute, granted to `nexus_app`) that returns only `tenant_id` and
`institution_id` for one form ID, so the public endpoint can open that tenant's RLS transaction without any
cross-tenant read access.

## Import jobs (M09 — `0030_import_jobs`)

All three tables have a `tenant_id`, forced RLS with the `tenant_isolation` policy and composite tenant references.
The application role can read all three and insert import jobs only (no update or delete yet).

| Table | Columns and constraints |
|---|---|
| `import_jobs` | Entity, file name, source format, template version, status, total / valid / error rows, the creating staff role profile (`(id, tenant_id)` reference), roll-back deadline and timestamps. The file name must be a plain name: 1-200 characters, not blank, `.` or `..`, no `/ : \` and no control characters. Template version is at least 1; row counts are not negative and valid plus error rows never exceed the total; `rollback_until` is set exactly when the job is completed; `updated_at >= created_at`. |
| `column_mappings` | One row per job (`job_id` primary key): `columns`, a JSON array of 1-200 mapped columns. |
| `import_row_issues` | Job, row number (at least 1), optional column name, severity, a `snake_case` code and a catalogue message key. Issues never hold imported cell values (V-7). |

## Timetable (M16 — `0031_timetable`)

All three tables have an opaque `id`, a `tenant_id`, an insertion-order column for stable paging, timestamps
(`updated_at >= created_at`), forced RLS with the `tenant_isolation` policy and composite tenant references. The
application role can read all three and insert timetable slots only. The migration adds a unique `(id, tenant_id)`
index on `subject_offerings` for the slot reference.

| Table | Columns and constraints |
|---|---|
| `rooms` | Institution, optional campus, code, name, kind (classroom, lab, hall, library, sports, online, other), optional capacity 1-5000, active. |
| `bell_schedules` | Institution, name and `periods`, a JSON array of 1-20 periods (code, label, start, end, break flag). |
| `timetable_slots` | Academic year, optional academic period, subject offering, ISO weekday 1-7, `start` / `end` as `HH:MM` text with `end > start`, optional room, up to 10 distinct staff profile IDs, effective dates (`effective_to >= effective_from`, open when null). Clashes are API checks, not constraints. |

## Attendance (M17 — `0032_attendance`)

All three tables have an opaque `id`, a `tenant_id`, an insertion-order column, forced RLS with the
`tenant_isolation` policy and composite tenant references. The application role can read all three and insert
attendance marks only: marks are append-only (no update or delete).

| Table | Columns and constraints |
|---|---|
| `attendance_sessions` | Institution, mode (daily, period, session, event), date, optional class group, timetable slot exactly for `period`, event label exactly for `event`, optional taking staff profile, status (open, submitted, locked), `submitted_at` exactly when not open, timestamps. |
| `attendance_marks` | Session, learner, status, `minutes_late` (1-600) exactly when `late`, encrypted `note`, method, `marked_at`, optional staff profile and device ID. |
| `leave_requests` | Learner, requesting person, `from` / `to` dates (`to >= from`), encrypted `reason`, status, deciding staff profile and `decided_at` exactly when approved or rejected, timestamps. |

`attendance_marks.note` and `leave_requests.reason` are FieldCipher text under the tenant's `tenant_data` key (a CHECK
rejects plaintext) and are listed in `ENCRYPTED_COLUMNS` for tenant export.

## Demo data
`uv run --project backend nexus-seed [--reset]` loads the five demo tenants (D16), their audit chains, identities, roles and module switches from
`backend/src/nexus/seed/demo_fixtures.json`, exported from the frontend mocks with
`pnpm --dir frontend --filter @nexus/mocks export:fixtures` (a mocks test fails when the file is stale). Upsert by
id; each tenant is written inside its own tenant context. `--reset` only with `NEXUS_ENVIRONMENT=dev`.

## Nexus Control database (`nexus_control`, `backend/control_migrations/`, D55)

Our own provider database, separate from every institution database (D22, V-1). Migrations `c0001`–`c0021`; the
owner role migrates and seeds (`uv run --project backend nexus-control-db`); the Control API runs as **`control_app`**,
which gets `SELECT` on what it shows and only the `INSERT` / column `UPDATE` grants listed below. No table holds
learner, family, health or ID data: the schema walk in `tests/security/test_control_no_access.py` fails on any such
column. The only personal data are staff, account contacts and the documented D60 command exceptions.

| Area (migrations) | Tables | Writes allowed to `control_app` and key rules |
|---|---|---|
| Staff & sessions (`c0001`, `c0002`; P13) | `staff_users`, `role_permissions`, `staff_sessions` | `UPDATE (last_sign_in_at)`; sessions `INSERT` + `UPDATE (revoked_at)`, token stored as a hash only |
| Accounts & CRM (`c0003`; P01) | `accounts`, `account_contacts`, `account_notes`, `contracts`, `opportunities`, `account_health` | notes `INSERT`; `accounts` `UPDATE (tenant_ids, region, delivery_model)` for provisioning and moves |
| Commercial & billing (`c0004`, `c0009`, `c0021`; P02, P03, P11) | `catalogue_items`, `quotes`, `subscriptions`, `invoices`, `credit_notes`, `payments`, `payment_links`, `dunning_states`, `usage_records`, `billing_webhook_events` | quote / subscription `UPDATE (status)`; invoices `INSERT` + `UPDATE (status, paid_at)`; payments `INSERT` + `UPDATE (lago_synced)`; payment links `INSERT` + `UPDATE (status)`; webhook events `INSERT` (dedupe by event id); money = minor units + currency |
| Licences (`c0005`; P05) | `licences` | column `UPDATE` of issue and expiry dates, state and signing fields only; signed in OpenBao, no key stored |
| Fleet & agents (`c0006`; P06) | `deployments`, `health_signals`, `deployment_agent_tokens` | `UPDATE (version, health, last_check_in_at, telemetry_enabled)`; health signals `INSERT` / `UPDATE` (counts and timings only); agent tokens stored as SHA-256 |
| Releases (`c0007`, `c0008`, `c0016`; P07) | `releases`, `rollouts` | `UPDATE (status, signed, published_at)` and `(status, started_at)`; `releases.signed_manifest` is internal and must verify before publishing |
| Support (`c0010`; P09) | `tickets`, `ticket_replies`, `sla_policies`, `kb_articles` | replies `INSERT`; tickets `UPDATE (status, assignee_staff_id, resolved_at)` |
| Extensions, projects, sandboxes (`c0011`; P08, P15, P17) | `extensions`, `extension_compatibility`, `implementation_projects`, `sandboxes` | read only |
| Partners & analytics (`c0012`; P12, P16) | `partners`, `deal_registrations`, `commissions`, `business_metrics` | read only; partners see only their accounts' rows |
| Trust (`c0013`; P14) | `sub_processors`, `certifications`, `security_incidents`, `dpa_records` | read only; breach deadline set iff personal data affected (CHECK) |
| Provisioning, offboarding, moves (`c0014`, `c0018`–`c0020`; P04, P18) | `provisioning_jobs`, `offboarding_jobs`, `shred_certificates`, `portability_jobs` | jobs `INSERT` + column `UPDATE` of steps, status and their command; step names, order and status checked by `control_job_steps_valid` (CHECK); two different approvers before key destruction (CHECK); shred certificates `INSERT` only, 88-character Ed25519 signature |
| Commands (`c0015`, `c0017`; D60, D63) | `deployment_commands` | `INSERT` + `UPDATE (status, delivered_at, finished_at, result)` — never the signed `payload` or `signature`; lifetime ≤ 24 h (CHECK); `result` ≤ 4 KB; overdue rows become `expired` and fail the step that waited (NEX-139) |
| Access broker (`c0017`; P10) | `broker_requests`, `broker_sessions`, `break_glass_cases` | requests `INSERT` + `UPDATE (status, decided_at)`; never `M83` in scope (CHECK); sessions and break-glass read only |

The demo rows come from `backend/src/nexus/control/control_fixtures.json` (exported from the frontend mocks; fixtures
version checked on seed).
