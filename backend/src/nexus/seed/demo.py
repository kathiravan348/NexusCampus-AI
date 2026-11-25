"""`uv run --project backend nexus-seed [--reset]`: loads the five demo tenants (D16) into the database.

Reads `demo_fixtures.json`, exported from the frontend mocks
(`pnpm --filter @nexus/mocks export:fixtures`). Idempotent: rows are upserted by id. Each tenant is written
inside its own tenant context, so Row-Level Security applies to the seed too. `--reset` deletes the demo
tenants' rows first and is refused outside `environment=dev`.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx2
from sqlalchemy import Connection, create_engine, text

from nexus.core.tenancy import TENANT_SETTING
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault, Vault, key_name
from nexus.seed.modules import MODULE_TABLES_CHILD_FIRST, seed_modules, seed_shared
from nexus.seed.rbac import RBAC_TABLES_CHILD_FIRST, seed_rbac
from nexus.seed.stage3 import STAGE3_TABLES_CHILD_FIRST, Sealer, seed_stage3
from nexus.settings import get_settings

FIXTURES = Path(__file__).with_name("demo_fixtures.json")
FIXTURES_VERSION = 16
#: Delete order for `--reset` (children first).
TABLES_CHILD_FIRST = (
    *STAGE3_TABLES_CHILD_FIRST,
    *MODULE_TABLES_CHILD_FIRST,
    "vault_keys",
    "scim_tokens",
    "sso_providers",
    *RBAC_TABLES_CHILD_FIRST,
    "guardian_links",
    "sessions",
    "role_profiles",
    "users",
    "people",
    "domain_events_outbox",
    "audit_chain_heads",
    "audit_events",
    "academic_calendars",
    "campuses",
    "institutions",
    "groups",
    "tenants",
)


def load_fixtures(path: Path = FIXTURES) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != FIXTURES_VERSION:
        raise ValueError(f"{path.name}: version {data.get('version')} != {FIXTURES_VERSION}; re-export")
    return data


def _scope(conn: Connection, tenant_id: str) -> None:
    conn.execute(text("SELECT set_config(:n, :t, true)"), {"n": TENANT_SETTING, "t": tenant_id})


def _rows(data: dict[str, Any], key: str, tenant_id: str) -> list[dict[str, Any]]:
    return [r for r in data[key] if r["tenantId"] == tenant_id]


def _upsert(conn: Connection, table: str, row: dict[str, Any]) -> None:
    cols = list(row)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "id")
    conn.execute(
        text(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) "  # noqa: S608
            f"ON CONFLICT (id) DO UPDATE SET {updates}"
        ),
        row,
    )


def seed_tenant(conn: Connection, data: dict[str, Any], tenant: dict[str, Any]) -> None:
    tid = tenant["id"]
    _scope(conn, tid)
    _upsert(conn, "tenants", {k: tenant[k] for k in ("id", "name", "type", "region")})
    for g in _rows(data, "groups", tid):
        _upsert(
            conn,
            "groups",
            {
                "id": g["id"],
                "tenant_id": tid,
                "name": g["name"],
                "region": g["region"],
                "created_at": g["createdAt"],
                "updated_at": g["updatedAt"],
            },
        )
    for i in _rows(data, "institutions", tid):
        loc = i["locale"]
        _upsert(
            conn,
            "institutions",
            {
                "id": i["id"],
                "tenant_id": tid,
                "group_id": i["groupId"],
                "name": i["name"],
                "type": i["type"],
                "region": i["region"],
                "status": i["status"],
                "default_locale": loc["defaultLocale"],
                "supported_locales": loc["supportedLocales"],
                "time_zone": loc["timeZone"],
                "currency": loc["currency"],
                "country": loc["country"],
                "weekend_days": loc["weekendDays"],
                "created_at": i["createdAt"],
                "updated_at": i["updatedAt"],
            },
        )
    for c in _rows(data, "campuses", tid):
        _upsert(
            conn,
            "campuses",
            {
                "id": c["id"],
                "tenant_id": tid,
                "institution_id": c["institutionId"],
                "code": c["code"],
                "name": c["name"],
                "time_zone": c["timeZone"],
                "address": json.dumps(c["address"]),
            },
        )
    for cal in _rows(data, "calendars", tid):
        _upsert(
            conn,
            "academic_calendars",
            {
                "id": cal["id"],
                "tenant_id": tid,
                "institution_id": cal["institutionId"],
                "academic_year": cal["academicYear"],
                "starts_on": cal["startsOn"],
                "ends_on": cal["endsOn"],
                "display_calendar": cal["displayCalendar"],
                "periods": json.dumps(cal["periods"]),
                "holidays": json.dumps(cal["holidays"]),
            },
        )


def _snake(row: dict[str, Any]) -> dict[str, Any]:
    """Contract row (camelCase) → columns (snake_case)."""
    return {re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower(): value for key, value in row.items()}


#: Identity tables whose contract fields map one-to-one onto columns (NEX-045).
IDENTITY = (
    ("people", "people"),
    ("users", "users"),
    ("role_profiles", "roleProfiles"),
    ("sessions", "sessions"),
    ("sso_providers", "ssoProviders"),
)


def seed_identity(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """People, users, role profiles and sessions. Demo sessions have no token hash: never usable."""
    for table, key in IDENTITY:
        for row in _rows(data, key, tid):
            _upsert(conn, table, _snake(row))
    for link in _rows(data, "guardianLinks", tid):
        conn.execute(
            text(
                "INSERT INTO guardian_links (tenant_id, guardian_person_id, learner_person_id) "
                "VALUES (:t, :g, :l) ON CONFLICT DO NOTHING"
            ),
            {"t": tid, "g": link["guardianPersonId"], "l": link["learnerPersonId"]},
        )
    for k in _rows(data, "keyStatuses", tid):
        row = {**_snake(k), "vault_key_name": key_name(tid, k["purpose"])}
        _upsert(conn, "vault_keys", row)


def seed_audit(conn: Connection, data: dict[str, Any], tenant_id: str) -> int:
    """Appends the mock audit chain with its stored hashes (rows are never updated: insert-if-absent).

    The chain head is only created when missing, so re-seeding never rewinds a chain the backend extended.
    """
    events = _rows(data, "auditEvents", tenant_id)
    for seq, e in enumerate(events, start=1):
        conn.execute(
            text(
                "INSERT INTO audit_events (id, tenant_id, seq, occurred_at, actor_kind, actor_id, grant_id, "
                "action, module_id, target_type, target_id, device_id, changes, prev_hash, hash) VALUES "
                "(:id, :t, :seq, :at, :ak, :aid, :gid, :action, :mid, :tt, :tid, :did, CAST(:ch AS jsonb), "
                ":prev, :hash) ON CONFLICT (id) DO NOTHING"
            ),
            {
                "id": e["id"],
                "t": tenant_id,
                "seq": seq,
                "at": e["occurredAt"],
                "ak": e["actorKind"],
                "aid": e["actorId"],
                "gid": e["grantId"],
                "action": e["action"],
                "mid": e["moduleId"],
                "tt": e["targetType"],
                "tid": e["targetId"],
                "did": e["deviceId"],
                "ch": json.dumps(e["changes"]),
                "prev": e["prevHash"],
                "hash": e["hash"],
            },
        )
    if events:
        conn.execute(
            text(
                "INSERT INTO audit_chain_heads (tenant_id, last_seq, last_hash) VALUES (:t, :seq, :hash) "
                "ON CONFLICT (tenant_id) DO NOTHING"
            ),
            {"t": tenant_id, "seq": len(events), "hash": events[-1]["hash"]},
        )
    return len(events)


def reset_tenant(conn: Connection, tenant_id: str) -> None:
    _scope(conn, tenant_id)
    # Owner-only switch of the append-only trigger (0002_audit_outbox); dev reset only.
    conn.execute(text("SELECT set_config('nexus.audit_maintenance', 'on', true)"))
    for table in TABLES_CHILD_FIRST:
        column = "id" if table == "tenants" else "tenant_id"
        conn.execute(text(f"DELETE FROM {table} WHERE {column} = :t"), {"t": tenant_id})  # noqa: S608


def seed(
    url: str,
    *,
    reset: bool = False,
    data: dict[str, Any] | None = None,
    vault: Vault | None = None,
) -> dict[str, int]:
    """Loads every demo tenant (one transaction each). Returns row counts per table.

    With a key service (`vault`) the Stage 3 demo rows are written too, sealing personal columns (D85). The shared
    test database is seeded without them, so module tests start from empty Stage 3 tables.
    """
    fixtures = data if data is not None else load_fixtures()
    engine = create_engine(url)
    sealer = Sealer(vault) if vault is not None else None
    stage3: dict[str, int] = {}
    try:
        with engine.begin() as conn:
            seed_shared(conn, fixtures)
        for tenant in fixtures["tenants"]:
            with engine.begin() as conn:
                if reset:
                    reset_tenant(conn, tenant["id"])
                seed_tenant(conn, fixtures, tenant)
                seed_identity(conn, fixtures, tenant["id"])
                seed_rbac(conn, fixtures, tenant["id"])
                seed_modules(conn, fixtures, tenant["id"])
                seed_audit(conn, fixtures, tenant["id"])
                if sealer is not None:
                    for table, count in seed_stage3(conn, fixtures, tenant["id"], sealer).items():
                        stage3[table] = stage3.get(table, 0) + count
    finally:
        if sealer is not None:
            sealer.close()
        engine.dispose()
    return {
        "tenants": len(fixtures["tenants"]),
        "groups": len(fixtures["groups"]),
        "institutions": len(fixtures["institutions"]),
        "campuses": len(fixtures["campuses"]),
        "academic_calendars": len(fixtures["calendars"]),
        "audit_events": len(fixtures["auditEvents"]),
        "people": len(fixtures["people"]),
        "users": len(fixtures["users"]),
        "role_profiles": len(fixtures["roleProfiles"]),
        "sessions": len(fixtures["sessions"]),
        "roles": len(fixtures["roles"]),
        "role_assignments": len(fixtures["roleAssignments"]),
        "entitlements": len(fixtures["entitlements"]),
        **stage3,
    }


def main() -> None:
    utf8_console()
    parser = argparse.ArgumentParser(description="Load the NexusCampus demo tenants.")
    parser.add_argument("--reset", action="store_true", help="delete demo tenants' rows first (dev only)")
    args = parser.parse_args()
    settings = get_settings()
    if args.reset and settings.environment != "dev":
        sys.exit("--reset is only allowed with NEXUS_ENVIRONMENT=dev")
    # Stage 3 rows are sealed through the configured key service (OpenBao in the dev stack, D85).
    vault = HttpVault(settings, httpx2.AsyncClient(timeout=10.0))
    counts = seed(settings.migrate_database_url.get_secret_value(), reset=args.reset, vault=vault)
    print("seeded " + ", ".join(f"{n} {t}" for t, n in counts.items()))


if __name__ == "__main__":
    main()
