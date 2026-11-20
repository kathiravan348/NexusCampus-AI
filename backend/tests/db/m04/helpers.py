"""Texts API test helpers (NEX-054)."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER

LOCALE = "en-IN"


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def owner_sql(owner_url: str, sql: str, params: dict[str, Any] | None = None) -> Any:
    engine = create_engine(owner_url)
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        rows = result.all() if result.returns_rows else None
    engine.dispose()
    return rows


@contextmanager
def group_override(owner_url: str, key: str) -> Iterator[None]:
    """A Little Steps group override of `key` (locks it for the institution), removed afterwards."""
    oid = f"tov-ls-group-{key.replace('.', '-')}"
    owner_sql(
        owner_url,
        "INSERT INTO text_overrides (id, tenant_id, scope_kind, scope_target_id, locale, key, message, version, "
        "updated_by, updated_at) VALUES (:id, 'ten-ls', 'group', 'grp-ls-test', :l, :k, 'Group word', 1, "
        "'usr-ls-priya', now())",
        {"id": oid, "l": LOCALE, "k": key},
    )
    try:
        yield
    finally:
        owner_sql(owner_url, "DELETE FROM text_overrides WHERE id = :id", {"id": oid})


def last_action(owner_url: str) -> str:
    rows = owner_sql(owner_url, "SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT 1")
    return str(rows[0][0])
