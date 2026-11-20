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

from sqlalchemy import Connection, create_engine, text

from nexus.core.tenancy import TENANT_SETTING
from nexus.core.timing import utf8_console
from nexus.seed.rbac import RBAC_TABLES_CHILD_FIRST, seed_rbac
from nexus.settings import get_settings

FIXTURES = Path(__file__).with_name("demo_fixtures.json")
FIXTURES_VERSION = 4
#: Delete order for `--reset` (children first).
TABLES_CHILD_FIRST = (
    *RBAC_TABLES_CHILD_FIRST,
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
)


def seed_identity(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """People, users, role profiles and sessions. Demo sessions have no token hash: never usable."""
    for table, key in IDENTITY:
        for row in _rows(data, key, tid):
            _upsert(conn, table, _snake(row))


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


def seed(url: str, *, reset: bool = False, data: dict[str, Any] | None = None) -> dict[str, int]:
    """Loads every demo tenant (one transaction each). Returns row counts per table."""
    fixtures = data if data is not None else load_fixtures()
    engine = create_engine(url)
    try:
        for tenant in fixtures["tenants"]:
            with engine.begin() as conn:
                if reset:
                    reset_tenant(conn, tenant["id"])
                seed_tenant(conn, fixtures, tenant)
                seed_identity(conn, fixtures, tenant["id"])
                seed_rbac(conn, fixtures, tenant["id"])
                seed_audit(conn, fixtures, tenant["id"])
    finally:
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
    }


def main() -> None:
    utf8_console()
    parser = argparse.ArgumentParser(description="Load the NexusCampus demo tenants.")
    parser.add_argument("--reset", action="store_true", help="delete demo tenants' rows first (dev only)")
    args = parser.parse_args()
    settings = get_settings()
    if args.reset and settings.environment != "dev":
        sys.exit("--reset is only allowed with NEXUS_ENVIRONMENT=dev")
    counts = seed(settings.migrate_database_url.get_secret_value(), reset=args.reset)
    print("seeded " + ", ".join(f"{n} {t}" for t, n in counts.items()))


if __name__ == "__main__":
    main()
