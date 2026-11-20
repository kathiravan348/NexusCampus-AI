"""Access requests (NEX-051, V-3): lists, approval that can only narrow, denial, who may decide."""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m83.helpers import approve, csrf, file_request, request_of
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
REQUEST_KEYS = {
    "id",
    "tenantId",
    "staffRef",
    "staffDisplayName",
    "reason",
    "modules",
    "mode",
    "durationHours",
    "status",
    "requestedAt",
    "decidedAt",
    "decidedBy",
}


def last_action(owner_url: str) -> str:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        action = conn.execute(
            text("SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT 1")
        ).scalar_one()
    engine.dispose()
    return str(action)


def test_lists_show_the_tenants_records_in_contract_shape(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    seeded = request_of(client, "acr-ls-0810")
    assert set(seeded) == REQUEST_KEYS and seeded["status"] == "expired" and seeded["decidedBy"] == "usr-ls-priya"
    items = client.get("/api/v1/access-requests?pageSize=100").json()["items"]
    assert all(r["tenantId"] == "ten-ls" for r in items)
    grants = client.get("/api/v1/access-grants?pageSize=100").json()["items"]
    assert "acg-ls-0810" in {g["id"] for g in grants}
    assert set(grants[0]) == {"id", "tenantId", "requestId", "modules", "mode", "startsAt", "endsAt", "revokedAt"}
    # Only Northbridge (EU) has a break-glass notice: Little Steps sees none.
    assert client.get("/api/v1/break-glass-notices").json()["total"] == 0


def test_approval_can_only_narrow_and_happens_once(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    request = file_request(client, ["M02", "M07"], "read", 24)
    assert request["status"] == "pending" and request["decidedAt"] is None
    url = f"/api/v1/access-requests/{request['id']}/approve"
    wider = {"modules": ["M02", "M03"], "mode": "edit", "durationHours": 48}
    res = client.post(url, json=wider, headers=csrf(client))
    assert res.status_code == 400
    assert {d["path"] for d in res.json()["error"]["details"]} == {"modules", "mode", "durationHours"}
    assert client.post(url, json={"modules": []}, headers=csrf(client)).status_code == 400
    grant = approve(client, request["id"], ["M02"], "read", 2)
    assert grant["modules"] == ["M02"] and grant["mode"] == "read" and grant["revokedAt"] is None
    span = datetime.fromisoformat(grant["endsAt"]) - datetime.fromisoformat(grant["startsAt"])
    assert span.total_seconds() == 2 * 3600
    assert last_action(test_db.owner_url) == "m83.accessRequest.approved"
    again = client.post(url, json={"modules": ["M02"], "mode": "read", "durationHours": 1}, headers=csrf(client))
    assert again.status_code == 409 and again.json()["error"]["code"] == "conflict"
    decided = request_of(client, request["id"])
    assert decided["status"] == "approved" and decided["decidedBy"] == "usr-ls-priya"


def test_deny_needs_a_reason_and_is_final(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    request = file_request(client, ["M03"])
    url = f"/api/v1/access-requests/{request['id']}/deny"
    assert client.post(url, json={"reason": "   "}, headers=csrf(client)).status_code == 400
    denied = client.post(url, json={"reason": "Not needed any more"}, headers=csrf(client))
    assert denied.status_code == 200 and denied.json()["status"] == "denied" and denied.json()["decidedAt"]
    assert last_action(test_db.owner_url) == "m83.accessRequest.denied"
    assert client.post(url, json={"reason": "again"}, headers=csrf(client)).status_code == 409
    unknown = client.post("/api/v1/access-requests/acr-nope/deny", json={"reason": "x"}, headers=csrf(client))
    assert unknown.status_code == 404


def test_only_grant_approvers_decide(client: TestClient, kc: FakeKeycloak) -> None:
    request = file_request(client, ["M02"])
    sign_in(client, kc, **ARJUN)
    res = client.post(
        f"/api/v1/access-requests/{request['id']}/approve",
        json={"modules": ["M02"], "mode": "read", "durationHours": 1},
        headers=csrf(client),
    )
    assert res.status_code == 403


def test_broker_stub_validates_like_the_contract(client: TestClient) -> None:
    body = {
        "staffRef": "stf-1",
        "staffDisplayName": "X",
        "reason": "r",
        "modules": ["M02", "M02"],
        "mode": "admin",
        "durationHours": 73,
    }
    res = client.post("/api/v1/dev/broker/tenants/ten-ls/access-requests", json=body)
    assert res.status_code == 400
    assert {d["path"] for d in res.json()["error"]["details"]} == {"modules", "mode", "durationHours"}
