# Database

> State as of: 2026-11-20 (NEX-043) · Migration: `0001_tenancy`

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

## Demo data
`uv run --project backend nexus-seed [--reset]` loads the five demo tenants (D16) from
`backend/src/nexus/seed/demo_fixtures.json`, exported from the frontend mocks with
`pnpm --dir frontend --filter @nexus/mocks export:fixtures` (a mocks test fails when the file is stale). Upsert by
id; each tenant is written inside its own tenant context. `--reset` only with `NEXUS_ENVIRONMENT=dev`.
