"""Text overrides (NEX-054, M04): save with ICU check, versions and revisions, delete, rollback, group locks."""

from fastapi.testclient import TestClient

from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import LOCALE, csrf, group_override, last_action
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
URL = "/api/v1/texts/overrides/term.learner"
Q = {"locale": LOCALE}


def details(res: object) -> set[str]:
    return {d["path"] for d in res.json()["error"]["details"]}  # type: ignore[attr-defined]


def test_save_delete_and_rollback_keep_one_history(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    first = client.put(URL, params=Q, json={"message": " Little one "}, headers=csrf(client))
    assert first.status_code == 200, first.text
    saved = first.json()
    assert saved["message"] == "Little one" and saved["scope"] == {"kind": "institution", "targetId": "ins-ls"}
    assert last_action(test_db.owner_url) == "m04.text.updated"
    second = client.put(URL, params=Q, json={"message": "Young learner"}, headers=csrf(client)).json()
    assert second["id"] == saved["id"] and second["version"] == saved["version"] + 1
    listed = client.get("/api/v1/texts/overrides", params=Q).json()["items"]
    assert any(o["key"] == "term.learner" and o["message"] == "Young learner" for o in listed)

    deleted = client.delete(URL, params=Q, headers=csrf(client))
    assert deleted.json() == {
        "deleted": True,
        "key": "term.learner",
        "locale": LOCALE,
        "version": second["version"] + 1,
    }
    assert all(o["key"] != "term.learner" for o in client.get("/api/v1/texts/overrides", params=Q).json()["items"])
    assert client.delete(URL, params=Q, headers=csrf(client)).status_code == 404

    restored = client.post(f"{URL}/rollback", params=Q, json={"version": saved["version"]}, headers=csrf(client))
    assert restored.status_code == 200
    body = restored.json()
    assert body["override"]["message"] == "Little one" and body["override"]["id"] == saved["id"]
    assert body["revision"]["version"] == second["version"] + 2  # versions never go backwards
    to_deleted = client.post(f"{URL}/rollback", params=Q, json={"version": second["version"] + 1}, headers=csrf(client))
    assert to_deleted.json()["override"] is None and to_deleted.json()["revision"]["message"] is None
    assert client.post(f"{URL}/rollback", params=Q, json={"version": 99}, headers=csrf(client)).status_code == 404
    assert last_action(test_db.owner_url) == "m04.text.rolledBack"

    history = client.get("/api/v1/texts/revisions", params={"key": "term.learner", **Q}).json()["items"]
    assert [r["message"] for r in history][-5:] == ["Little one", "Young learner", None, "Little one", None]


def test_bad_locale_key_and_icu(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    bad_icu = client.put(URL, params=Q, json={"message": "{n, plural, one {x}}"}, headers=csrf(client))
    assert bad_icu.status_code == 400 and details(bad_icu) == {"message"}
    both = client.put(
        "/api/v1/texts/overrides/no.such", params={"locale": "en_IN"}, json={"message": "x"}, headers=csrf(client)
    )
    assert both.status_code == 400 and details(both) == {"locale", "key"}
    assert client.put(URL, params=Q, json={"message": "  "}, headers=csrf(client)).status_code == 400


def test_group_override_locks_the_key(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    url = "/api/v1/texts/overrides/term.class"
    with group_override(test_db.owner_url, "term.class"):
        put = client.put(url, params=Q, json={"message": "Room"}, headers=csrf(client))
        assert put.status_code == 409 and details(put) == {"key"}
        assert client.delete(url, params=Q, headers=csrf(client)).status_code == 409
        assert client.post(f"{url}/rollback", params=Q, json={"version": 1}, headers=csrf(client)).status_code == 409


def test_teachers_read_but_cannot_edit(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/texts/overrides").status_code == 200
    assert client.get("/api/v1/texts/revisions").status_code == 403
    assert client.put(URL, params=Q, json={"message": "x"}, headers=csrf(client)).status_code == 403
