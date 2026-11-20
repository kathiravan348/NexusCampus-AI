"""Devices (NEX-057, M10): visibility, register, heartbeat."""

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
SUNITA = {"email": "sunita.rao@family.test", "sub": "kc-sunita"}
CONFLICT_KEYS = {
    "id",
    "tenantId",
    "deviceId",
    "moduleId",
    "operation",
    "mergeRule",
    "summaryKey",
    "clientVersion",
    "serverVersion",
    "status",
    "resolution",
    "createdAt",
    "resolvedAt",
}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def test_managers_see_all_devices_others_their_own(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    ids = {d["id"] for d in client.get("/api/v1/devices?pageSize=100").json()["items"]}
    assert {"dev-ls-office-pc", "dev-ls-arjun-tablet"} <= ids
    sign_in(client, kc, **ARJUN)
    mine = client.get("/api/v1/devices?pageSize=100").json()["items"]
    assert mine and {d["userId"] for d in mine} == {"usr-ls-arjun"}
    conflicts = client.get("/api/v1/sync-conflicts").json()["items"]
    assert {c["deviceId"] for c in conflicts} == {"dev-ls-arjun-tablet"} and set(conflicts[0]) == CONFLICT_KEYS
    sign_in(client, kc, **SUNITA)
    assert client.get("/api/v1/devices").status_code == 403


def test_register_and_heartbeat(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    body = {"label": "Staff room phone", "platform": "android"}
    created = client.post("/api/v1/devices", json=body, headers=csrf(client))
    assert created.status_code == 201 and created.json()["status"] == "active" and created.json()["lastSyncAt"] is None
    device_id = created.json()["id"]
    beat = client.post(f"/api/v1/devices/{device_id}/heartbeat", json={"pendingCount": 2}, headers=csrf(client))
    assert beat.json()["action"] == "sync" and beat.json()["device"]["pendingCount"] == 2
    assert beat.json()["device"]["lastSyncAt"] is not None
    other = client.post("/api/v1/devices/dev-ls-office-pc/heartbeat", json={"pendingCount": 0}, headers=csrf(client))
    assert other.status_code == 404  # the device belongs to someone else
    bad = client.post("/api/v1/devices", json={"label": "", "platform": "fax"}, headers=csrf(client))
    assert bad.status_code == 400
