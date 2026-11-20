"""Idempotent replay (NEX-057, O-2): any guarded write with `Idempotency-Key` is applied once."""

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.fake_keycloak import FakeKeycloak

URL = "/api/v1/texts/overrides/common.empty"
Q = {"locale": "en-IN"}


def headers(c: TestClient, key: str) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or "", "Idempotency-Key": key}


def updates(owner_url: str, override_id: str) -> int:
    rows = owner_sql(
        owner_url,
        "SELECT count(*) FROM audit_events WHERE action = 'm04.text.updated' AND target_id = :id",
        {"id": override_id},
    )
    return int(rows[0][0])


def test_same_write_three_times_is_applied_once(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    answers = [
        client.put(URL, params=Q, json={"message": "Guides"}, headers=headers(client, "outbox-7f3a")) for _ in range(3)
    ]
    assert [a.status_code for a in answers] == [200, 200, 200]
    assert answers[0].json() == answers[1].json() == answers[2].json()
    assert "idempotent-replay" not in answers[0].headers and answers[2].headers["idempotent-replay"] == "true"
    assert answers[0].json()["version"] == 1 and updates(test_db.owner_url, answers[0].json()["id"]) == 1


def test_key_reuse_with_another_body_and_failed_writes(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    first = client.put(URL, params=Q, json={"message": "Mentors"}, headers=headers(client, "outbox-8b21"))
    assert first.status_code == 200
    other = client.put(URL, params=Q, json={"message": "Coaches"}, headers=headers(client, "outbox-8b21"))
    assert other.status_code == 409 and other.json()["error"]["details"][0]["path"] == "Idempotency-Key"
    # A refused write does not burn its key: fixing the request and retrying with the same key works.
    bad = client.put(URL, params=Q, json={"message": "{x"}, headers=headers(client, "outbox-9c44"))
    assert bad.status_code == 400
    good = client.put(URL, params=Q, json={"message": "Tutors"}, headers=headers(client, "outbox-9c44"))
    assert good.status_code == 200 and good.json()["message"] == "Tutors"
    too_long = client.put(URL, params=Q, json={"message": "x"}, headers=headers(client, "k" * 200))
    assert too_long.status_code == 400
