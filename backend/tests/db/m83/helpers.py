"""Provider access test helpers (NEX-051): act as provider staff through the dev broker stub."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER

STAFF = "stf-0042"
BROKER = "/api/v1/dev/broker/tenants/ten-ls"


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def bearer(credential: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {credential}"}


def file_request(c: TestClient, modules: list[str], mode: str = "read", hours: int = 24) -> dict[str, Any]:
    body = {
        "staffRef": STAFF,
        "staffDisplayName": "A. Morgan (Nexus Support)",
        "reason": "Support ticket 1234",
        "modules": modules,
        "mode": mode,
        "durationHours": hours,
    }
    res = c.post(f"{BROKER}/access-requests", json=body)
    assert res.status_code == 201, res.text
    filed: dict[str, Any] = res.json()
    return filed


def approve(c: TestClient, request_id: str, modules: list[str], mode: str = "read", hours: int = 2) -> dict[str, Any]:
    """Approves as the signed-in owner; returns the grant."""
    res = c.post(
        f"/api/v1/access-requests/{request_id}/approve",
        json={"modules": modules, "mode": mode, "durationHours": hours},
        headers=csrf(c),
    )
    assert res.status_code == 200, res.text
    grant: dict[str, Any] = res.json()["grant"]
    return grant


def credential(c: TestClient, grant_id: str, staff: str = STAFF) -> Any:
    return c.post(f"{BROKER}/access-grants/{grant_id}/credential", json={"staffRef": staff})


def granted(c: TestClient, modules: list[str], mode: str = "read", hours: int = 2) -> tuple[dict[str, Any], str]:
    """File, approve (owner must be signed in) and fetch a credential: `(grant, credential)`."""
    request = file_request(c, modules, mode, hours)
    grant = approve(c, request["id"], modules, mode, hours)
    res = credential(c, grant["id"])
    assert res.status_code == 200, res.text
    return grant, res.json()["credential"]


def grant_audit(owner_url: str, grant_id: str) -> list[tuple[str, str, str]]:
    """`(action, actorKind, actorId)` of every audit row naming the grant, in chain order."""
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT action, actor_kind, actor_id FROM audit_events WHERE grant_id = :g ORDER BY seq"),
            {"g": grant_id},
        ).all()
    engine.dispose()
    return [(r[0], r[1], r[2]) for r in rows]


def owner_execute(owner_url: str, sql: str, params: dict[str, Any]) -> None:
    engine = create_engine(owner_url)
    with engine.begin() as conn:
        conn.execute(text(sql), params)
    engine.dispose()


def request_of(c: TestClient, request_id: str) -> dict[str, Any]:
    """One access request from the signed-in owner's list."""
    items = c.get("/api/v1/access-requests?pageSize=100").json()["items"]
    found: dict[str, Any] = next(r for r in items if r["id"] == request_id)
    return found
