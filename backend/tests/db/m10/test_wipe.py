"""Remote wipe (NEX-057, O-3): revoke, then `wipe` on the next heartbeat, then 401; lost writes counted; audited."""

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


def csrf(c: TestClient, **extra: str) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or "", **extra}


def test_revoke_then_wipe_then_refused(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc, **ARJUN)
    new = {"label": "Old tablet", "platform": "android"}
    device = client.post("/api/v1/devices", json=new, headers=csrf(client)).json()
    beat = f"/api/v1/devices/{device['id']}/heartbeat"
    client.post(beat, json={"pendingCount": 4}, headers=csrf(client))
    assert client.post(f"/api/v1/devices/{device['id']}/revoke", json={}, headers=csrf(client)).status_code == 403

    sign_in(client, kc)
    revoked = client.post(f"/api/v1/devices/{device['id']}/revoke", json={}, headers=csrf(client))
    assert revoked.status_code == 200
    assert revoked.json()["status"] == "revoke_pending" and revoked.json()["lostWriteCount"] == 4
    assert client.post(f"/api/v1/devices/{device['id']}/revoke", json={}, headers=csrf(client)).status_code == 409

    sign_in(client, kc, **ARJUN)
    wipe = client.post(beat, json={"pendingCount": 1}, headers=csrf(client))
    assert wipe.json()["action"] == "wipe"
    assert wipe.json()["device"]["status"] == "revoked" and wipe.json()["device"]["lostWriteCount"] == 5
    assert client.post(beat, json={"pendingCount": 0}, headers=csrf(client)).status_code == 401
    actions = owner_sql(
        test_db.owner_url, "SELECT action FROM audit_events WHERE target_id = :id ORDER BY seq", {"id": device["id"]}
    )
    assert [a[0] for a in actions] == ["m10.device.registered", "m10.device.revokeRequested", "m10.device.wiped"]


def test_own_current_device_needs_a_second_confirmation(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    new = {"label": "This laptop", "platform": "web"}
    mine = client.post("/api/v1/devices", json=new, headers=csrf(client)).json()
    url = f"/api/v1/devices/{mine['id']}/revoke"
    current = {"X-Device-Id": mine["id"]}
    first = client.post(url, json={}, headers=csrf(client, **current))
    assert first.status_code == 409 and first.json()["error"]["details"][0]["path"] == "confirmOwnDevice"
    second = client.post(url, json={"confirmOwnDevice": True}, headers=csrf(client, **current))
    assert second.status_code == 200 and second.json()["status"] == "revoke_pending"
