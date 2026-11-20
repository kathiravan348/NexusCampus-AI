"""My notification preferences (NEX-056, M07): own rows only, quiet hours, offline replay via Idempotency-Key."""

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.fake_keycloak import FakeKeycloak

SUNITA = {"email": "sunita.rao@family.test", "sub": "kc-sunita"}
URL = "/api/v1/notification-preferences"
SAVE = {"channels": [{"channel": "email", "enabled": False}, {"channel": "in_app", "enabled": True}],
        "quietHours": {"start": "22:00", "end": "06:30"}}  # fmt: skip


def headers(c: TestClient, key: str | None = None) -> dict[str, str]:
    h = {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}
    return {**h, "Idempotency-Key": key} if key else h


def audits(owner_url: str) -> int:
    rows = owner_sql(
        owner_url,
        "SELECT count(*) FROM audit_events WHERE action = 'm07.preference.updated' AND target_id = 'usr-ls-sunita'",
    )
    return int(rows[0][0])


def test_my_preferences_and_channel_availability(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **SUNITA)
    body = client.get(URL).json()
    assert all(p["userId"] == "usr-ls-sunita" for p in body["preferences"])
    available = {c["channel"]: c["available"] for c in body["channels"]}
    assert available["email"] and available["in_app"] and not available["push"] and not available["sms"]


def test_save_replays_with_the_same_key_only_once(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc, **SUNITA)
    before = audits(test_db.owner_url)
    first = client.put(URL, json=SAVE, headers=headers(client, "queue-0001"))
    assert first.status_code == 200, first.text
    saved = {(p["channel"], p["eventType"]): p for p in first.json()["preferences"]}
    assert saved[("email", None)]["enabled"] is False
    assert saved[("in_app", None)]["quietHours"] == {"start": "22:00", "end": "06:30"}
    assert saved[("in_app", None)]["timeZone"] == "Asia/Kolkata"
    replay = client.put(URL, json=SAVE, headers=headers(client, "queue-0001"))
    assert replay.status_code == 200 and replay.json() == first.json()
    assert audits(test_db.owner_url) == before + 1  # the replay changed nothing
    other = client.put(URL, json={**SAVE, "quietHours": None}, headers=headers(client, "queue-0001"))
    assert other.status_code == 409


def test_equal_quiet_hours_are_refused(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **SUNITA)
    res = client.put(URL, json={**SAVE, "quietHours": {"start": "21:00", "end": "21:00"}}, headers=headers(client))
    assert res.status_code == 400 and res.json()["error"]["details"][0]["path"] == "quietHours"
    assert (
        client.put(
            URL, json={"channels": [{"channel": "fax", "enabled": True}], "quietHours": None}, headers=headers(client)
        ).status_code
        == 400
    )
