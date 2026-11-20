"""Audit log API (NEX-052, M06): filters, chain order, the read itself audited."""

import itertools

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
EVENT_KEYS = {
    "id",
    "tenantId",
    "occurredAt",
    "actorKind",
    "actorId",
    "grantId",
    "action",
    "moduleId",
    "targetType",
    "targetId",
    "deviceId",
    "changes",
    "prevHash",
    "hash",
}


def last_action(owner_url: str) -> str:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        action = conn.execute(
            text("SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT 1")
        ).scalar_one()
    engine.dispose()
    return str(action)


def test_audit_log_pages_in_chain_order_and_audits_the_read(
    client: TestClient, kc: FakeKeycloak, test_db: DbUrls
) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/audit-events?pageSize=50").json()
    items = page["items"]
    assert page["total"] >= len(items) > 1 and set(items[0]) == EVENT_KEYS
    assert items[0]["prevHash"] is None
    assert all(b["prevHash"] == a["hash"] for a, b in itertools.pairwise(items))
    assert all(e["tenantId"] == "ten-ls" for e in items)
    assert last_action(test_db.owner_url) == "m06.auditLog.viewed"


def test_filters_are_exact_and_time_bounds_inclusive(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    first = client.get("/api/v1/audit-events?pageSize=1").json()["items"][0]
    by_action = client.get("/api/v1/audit-events", params={"action": first["action"], "pageSize": 100}).json()
    assert by_action["total"] >= 1 and {e["action"] for e in by_action["items"]} == {first["action"]}
    at = first["occurredAt"]
    window = client.get("/api/v1/audit-events", params={"from": at, "to": at, "pageSize": 100}).json()
    assert first["id"] in {e["id"] for e in window["items"]}
    assert all(e["occurredAt"] == at for e in window["items"])
    assert client.get("/api/v1/audit-events", params={"actorId": "usr-nobody"}).json()["total"] == 0
    bad = client.get("/api/v1/audit-events", params={"from": "2026-09-01", "to": "yesterday"})
    assert bad.status_code == 400 and bad.json()["error"]["details"][0]["path"] == "from"


def test_audit_log_needs_audit_read(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/audit-events").status_code == 403
