"""Demo rows of the module tables (Stage 1 APIs): M83 provider access (NEX-051), M06 privacy (NEX-052), M03 themes
and the font library (NEX-053), M04 text overrides with their revisions (NEX-054),
M05 plans and usage (NEX-055), M07 notifications (NEX-056), M10 devices and conflicts (NEX-057),
M11 AI settings, credits and the demo index (NEX-058). Same shapes as the mock
fixtures; idempotent upserts.
"""

import json
import re
from typing import Any

from sqlalchemy import Connection, text

from nexus.modules.m11.retrieval import hash_embedding, vector_literal

#: Children first, for `--reset` (the font library is shared, so it is never deleted per tenant).
MODULE_TABLES_CHILD_FIRST = (
    "ai_chunks",
    "ai_answer_log",
    "ai_credits",
    "ai_settings",
    "sync_conflicts",
    "devices",
    "idempotency_keys",
    "notification_preferences",
    "notification_deliveries",
    "notification_templates",
    "usage_meters",
    "tenant_plans",
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
    ("devices", "devices"),
    ("sync_conflicts", "syncConflicts"),
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


def _upsert(
    conn: Connection, table: str, row: dict[str, Any], key: str = "id", casts: dict[str, str] | None = None
) -> None:
    cols = list(row)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != key)
    values = ", ".join(f"CAST(:{c} AS {casts[c]})" if casts and c in casts else f":{c}" for c in cols)
    conn.execute(
        text(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({values}) "  # noqa: S608
            f"ON CONFLICT ({key}) DO UPDATE SET {updates}"
        ),
        row,
    )


def seed_shared(conn: Connection, data: dict[str, Any]) -> None:
    """Platform reference data (no tenant): the font library and the plan catalogue."""
    for font in data["fonts"]:
        _upsert(conn, "fonts", {**_snake(font), "tenant_id": None})
    for plan in data["plans"]:
        _upsert(conn, "plans", _snake(plan))


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
    seed_ai(conn, data, tid)
    for template in _rows(data, "notificationTemplates", tid):
        _upsert(conn, "notification_templates", _snake(template))
    for delivery in _rows(data, "notificationDeliveries", tid):
        _upsert(conn, "notification_deliveries", _snake(delivery))
    seed_preferences(conn, data, tid)
    for tp in _rows(data, "tenantPlans", tid):
        _upsert(conn, "tenant_plans", {"tenant_id": tid, "plan_id": tp["planId"]}, key="tenant_id")
    for meter in _rows(data, "usageMeters", tid):
        conn.execute(
            text(
                'INSERT INTO usage_meters (tenant_id, metric, period_start, period_end, used, "limit") '
                "VALUES (:t, :m, :s, :e, :u, :l) ON CONFLICT (tenant_id, metric, period_start) DO UPDATE SET "
                'period_end = EXCLUDED.period_end, used = EXCLUDED.used, "limit" = EXCLUDED."limit"'
            ),
            {
                "t": tid,
                "m": meter["metric"],
                "s": meter["periodStart"],
                "e": meter["periodEnd"],
                "u": meter["used"],
                "l": meter["limit"],
            },
        )
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


def seed_preferences(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """Preferences carry no tenant in the contract: taken from the user."""
    users = {u["id"] for u in _rows(data, "users", tid)}
    for p in data["notificationPreferences"]:
        if p["userId"] not in users:
            continue
        quiet = p["quietHours"] or {"start": None, "end": None}
        event = p["eventType"] or "all"
        conn.execute(
            text(
                "INSERT INTO notification_preferences (id, tenant_id, user_id, channel, event_type, enabled, "
                "quiet_start, quiet_end, time_zone) VALUES (:id, :t, :u, :c, :e, :en, :s, :q, :z) "
                "ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, quiet_start = EXCLUDED.quiet_start, "
                "quiet_end = EXCLUDED.quiet_end, time_zone = EXCLUDED.time_zone"
            ),
            {
                "id": f"npf-{p['userId']}-{p['channel']}-{event}".replace(".", "-"),
                "t": tid,
                "u": p["userId"],
                "c": p["channel"],
                "e": p["eventType"],
                "en": p["enabled"],
                "s": quiet["start"],
                "q": quiet["end"],
                "z": p["timeZone"],
            },
        )


def seed_ai(conn: Connection, data: dict[str, Any], tid: str) -> None:
    """AI settings and credits, plus the dev index: institution settings and calendars (M01) as chunks, embedded
    with the deterministic dev embedder (a real cell re-indexes with its Bedrock model)."""
    for st in _rows(data, "aiSettings", tid):
        _upsert(
            conn,
            "ai_settings",
            {
                "tenant_id": tid,
                "enabled": st["enabled"],
                "modules": json.dumps(st["modules"]),
                "blocked_modules": st["blockedModules"],
                "safeguarding_enabled": st["safeguardingEnabled"],
                "default_tier": st["defaultTier"],
                "provider_kind": st["provider"]["kind"],
                "provider_label": st["provider"]["label"],
                "updated_at": st["updatedAt"],
            },
            key="tenant_id",
            casts={"modules": "jsonb"},
        )
    for c in _rows(data, "aiCredits", tid):
        conn.execute(
            text(
                "INSERT INTO ai_credits (tenant_id, period_start, period_end, granted, used, hard_cap) "
                "VALUES (:t, :s, :e, :g, :u, :h) ON CONFLICT (tenant_id, period_start) DO UPDATE SET "
                "granted = EXCLUDED.granted, used = EXCLUDED.used, hard_cap = EXCLUDED.hard_cap"
            ),
            {
                "t": tid,
                "s": c["periodStart"],
                "e": c["periodEnd"],
                "g": c["granted"],
                "u": c["used"],
                "h": c["hardCap"],
            },
        )
    names = {i["id"]: i["name"] for i in _rows(data, "institutions", tid)}
    for inst in _rows(data, "institutions", tid):
        loc = inst["locale"]
        content = (
            f"{inst['name']} uses time zone {loc['timeZone']}, currency {loc['currency']}, "
            f"country {loc['country']}; languages {', '.join(loc['supportedLocales'])}."
        )
        _chunk(conn, tid, "institution", inst["id"], f"{inst['name']} settings", loc["defaultLocale"], content)
    for cal in _rows(data, "calendars", tid):
        periods = "; ".join(f"{p['name']} {p['startsOn']} to {p['endsOn']}" for p in cal.get("periods", []))
        label = f"{names.get(cal['institutionId'], '')} calendar {cal['academicYear']}".strip()
        content = f"Academic year {cal['academicYear']} runs {cal['startsOn']} to {cal['endsOn']}. Terms: {periods}."
        _chunk(conn, tid, "academicCalendar", cal["id"], label, "und", content)


def _chunk(conn: Connection, tid: str, record_type: str, record_id: str, label: str, locale: str, content: str) -> None:
    conn.execute(
        text(
            "INSERT INTO ai_chunks (id, tenant_id, module_id, record_type, record_id, label, locale, content, "
            "embedding) "
            "VALUES (:id, :t, 'M01', :rt, :rid, :l, :loc, :c, CAST(:e AS vector)) "
            "ON CONFLICT (tenant_id, module_id, record_type, record_id, locale) DO UPDATE SET label = EXCLUDED.label, "
            "content = EXCLUDED.content, embedding = EXCLUDED.embedding"
        ),
        {
            "id": f"aic-{record_id}",
            "t": tid,
            "rt": record_type,
            "rid": record_id,
            "l": label[:200],
            "loc": locale,
            "c": content,
            "e": vector_literal(hash_embedding(label + "\n" + content)),
        },
    )
