"""Demo rows of the module tables (Stage 1 APIs): M83 provider access (NEX-051), M06 privacy (NEX-052), M03 themes
and the font library (NEX-053), M04 text overrides with their revisions (NEX-054). Same shapes as the mock
fixtures; idempotent upserts.
"""

import json
import re
from typing import Any

from sqlalchemy import Connection, text

#: Children first, for `--reset` (the font library is shared, so it is never deleted per tenant).
MODULE_TABLES_CHILD_FIRST = (
    "text_override_revisions",
    "text_overrides",
    "themes",
    "tenant_compliance",
    "data_subject_requests",
    "consents",
    "break_glass_notices",
    "access_grants",
    "access_requests",
)
#: Tables whose contract fields map one-to-one onto columns, in insert order.
PLAIN = (
    ("access_requests", "accessRequests"),
    ("access_grants", "accessGrants"),
    ("break_glass_notices", "breakGlassNotices"),
    ("consents", "consents"),
    ("data_subject_requests", "dataSubjectRequests"),
)
_CAMEL = re.compile(r"(?<!^)(?=[A-Z])")


def _rows(data: dict[str, Any], key: str, tenant_id: str) -> list[dict[str, Any]]:
    return [r for r in data[key] if r["tenantId"] == tenant_id]


def _snake(row: dict[str, Any]) -> dict[str, Any]:
    return {_CAMEL.sub("_", k).lower(): v for k, v in row.items()}


def _upsert(conn: Connection, table: str, row: dict[str, Any], key: str = "id") -> None:
    cols = list(row)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != key)
    conn.execute(
        text(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) "  # noqa: S608
            f"ON CONFLICT ({key}) DO UPDATE SET {updates}"
        ),
        row,
    )


def seed_fonts(conn: Connection, data: dict[str, Any]) -> None:
    """The shared font library (no tenant)."""
    for font in data["fonts"]:
        _upsert(conn, "fonts", {**_snake(font), "tenant_id": None})


def seed_modules(conn: Connection, data: dict[str, Any], tid: str) -> None:
    for table, key in PLAIN:
        for row in _rows(data, key, tid):
            _upsert(conn, table, _snake(row))
    for pack in _rows(data, "tenantCompliance", tid):
        conn.execute(
            text("INSERT INTO tenant_compliance (tenant_id, pack_code) VALUES (:t, :p) ON CONFLICT DO NOTHING"),
            {"t": tid, "p": pack["packCode"]},
        )
    seed_texts(conn, data, tid)
    for theme in _rows(data, "themes", tid):
        conn.execute(
            text(
                "INSERT INTO themes (id, tenant_id, scope_kind, scope_target_id, light, dark, fonts, radius, "
                "density, assets, locked_tokens, version, updated_by, updated_at) VALUES (:id, :t, :kind, :target, "
                "CAST(:light AS jsonb), CAST(:dark AS jsonb), CAST(:fonts AS jsonb), CAST(:radius AS jsonb), "
                ":density, CAST(:assets AS jsonb), :locked, :version, :by, :at) ON CONFLICT (id) DO UPDATE SET "
                "light = EXCLUDED.light, dark = EXCLUDED.dark, fonts = EXCLUDED.fonts, radius = EXCLUDED.radius, "
                "density = EXCLUDED.density, assets = EXCLUDED.assets, locked_tokens = EXCLUDED.locked_tokens, "
                "version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at"
            ),
            {
                "id": theme["id"],
                "t": tid,
                "kind": theme["scope"]["kind"],
                "target": theme["scope"]["targetId"],
                **{k: json.dumps(theme[k]) for k in ("light", "dark", "fonts", "radius", "assets")},
                "density": theme["density"],
                "locked": theme["lockedTokens"],
                "version": theme["version"],
                "by": theme["updatedBy"],
                "at": theme["updatedAt"],
            },
        )


def seed_texts(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """Text overrides, then their revisions (revisions carry no tenant in the contract: taken from the override)."""
    ids = set()
    for o in _rows(data, "textOverrides", tid):
        ids.add(o["id"])
        row = {k: v for k, v in _snake(o).items() if k != "scope"}
        _upsert(
            conn, "text_overrides", {**row, "scope_kind": o["scope"]["kind"], "scope_target_id": o["scope"]["targetId"]}
        )
    for r in data["textOverrideRevisions"]:
        if r["overrideId"] in ids:
            conn.execute(
                text(
                    "INSERT INTO text_override_revisions (override_id, version, tenant_id, message, changed_by, "
                    "changed_at) VALUES (:o, :v, :t, :m, :by, :at) ON CONFLICT DO NOTHING"
                ),
                {
                    "o": r["overrideId"],
                    "v": r["version"],
                    "t": tid,
                    "m": r["message"],
                    "by": r["changedBy"],
                    "at": r["changedAt"],
                },
            )
