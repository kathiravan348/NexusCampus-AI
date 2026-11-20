"""Notification templates and delivery log (NEX-056, M07): ICU check, subject iff email, add a language."""

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m07.render import render, sample_values
from nexus.seed.demo import load_fixtures
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import last_action
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
EMAIL = "ntp-ls-m02-user-email-en"


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def test_every_demo_template_renders_with_the_preview_samples() -> None:
    for t in load_fixtures()["notificationTemplates"]:
        for text in filter(None, (t["subject"], t["body"])):
            assert "{" not in render(text, sample_values(text), t["locale"]), t["id"]


def test_list_and_update_bump_the_version(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/notification-templates").json()
    assert page["total"] >= 6 and {t["locale"] for t in page["items"]} >= {"en-IN"}
    before = next(t for t in page["items"] if t["id"] == EMAIL)
    body = {"subject": "Welcome to {institution}", "body": "Hi {name}, join {institution}.", "enabled": True}
    res = client.put(f"/api/v1/notification-templates/{EMAIL}", json=body, headers=csrf(client))
    assert res.status_code == 200 and res.json()["version"] == before["version"] + 1
    assert last_action(test_db.owner_url) == "m07.template.updated"


def test_icu_and_subject_rules(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    url = f"/api/v1/notification-templates/{EMAIL}"
    bad_icu = client.put(
        url, json={"subject": "Hi {x", "body": "{n, plural, one {x}}", "enabled": True}, headers=csrf(client)
    )
    assert bad_icu.status_code == 400
    assert {d["path"] for d in bad_icu.json()["error"]["details"]} == {"subject", "body"}
    no_subject = client.put(url, json={"subject": None, "body": "Hi", "enabled": True}, headers=csrf(client))
    assert no_subject.status_code == 400 and no_subject.json()["error"]["details"][0]["path"] == "subject"
    assert client.put("/api/v1/notification-templates/ntp-nope", json={}, headers=csrf(client)).status_code == 404


def test_add_a_language_once(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    new = {
        "eventType": "m07.announcement.published",
        "channel": "in_app",
        "locale": "ta-IN",
        "subject": None,
        "body": "{institution} புதிய அறிவிப்பு: {title}",
        "enabled": True,
    }
    created = client.post("/api/v1/notification-templates", json=new, headers=csrf(client))
    assert created.status_code == 201 and created.json()["version"] == 1
    assert last_action(test_db.owner_url) == "m07.template.created"
    duplicate = client.post("/api/v1/notification-templates", json=new, headers=csrf(client))
    assert duplicate.status_code == 409
    sms_subject = client.post(
        "/api/v1/notification-templates", json={**new, "channel": "sms", "subject": "x"}, headers=csrf(client)
    )
    assert sms_subject.status_code == 400


def test_delivery_log_filters_newest_first(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    all_rows = client.get("/api/v1/notification-deliveries").json()["items"]
    assert [d["queuedAt"] for d in all_rows] == sorted((d["queuedAt"] for d in all_rows), reverse=True)
    failed = client.get("/api/v1/notification-deliveries", params={"status": "failed"}).json()["items"]
    assert failed and all(d["status"] == "failed" and d["reason"] for d in failed)
    assert client.get("/api/v1/notification-deliveries", params={"channel": "push"}).json()["total"] == 0


def test_teachers_cannot_manage_templates(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/notification-templates").status_code == 403
