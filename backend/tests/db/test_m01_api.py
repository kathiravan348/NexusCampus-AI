"""M01 API (NEX-047): backend twins of the mock's `handlers/m01.test.ts` cases, plus RLS and audit checks."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m01.profiles import PROFILES
from nexus.seed.demo import load_fixtures
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
LOCALE = {
    "defaultLocale": "en-IN",
    "supportedLocales": ["en-IN", "hi-IN", "ta-IN"],
    "timeZone": "Asia/Kolkata",
    "currency": "INR",
    "country": "IN",
    "weekendDays": [0],
}
CAMPUS = {
    "institutionId": "ins-ls",
    "code": "KRM",
    "name": "Little Steps Koramangala",
    "timeZone": None,
    "address": {"line1": "1 Example Road", "city": "Bengaluru", "countryCode": "IN"},
}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def last_action(owner_url: str) -> str:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        action = conn.execute(
            text("SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT 1")
        ).scalar_one()
    engine.dispose()
    return str(action)


def details(res: Any) -> set[str]:
    return {d["path"] for d in res.json()["error"].get("details", [])}


def test_tenant_profile_and_calendars(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    body = client.get("/api/v1/tenant").json()
    assert body["group"] is None and [i["id"] for i in body["institutions"]] == ["ins-ls"]
    assert {c["tenantId"] for c in body["campuses"]} == {"ten-ls"}
    assert body["institutions"][0]["locale"]["timeZone"] == "Asia/Kolkata"
    assert "line2" not in body["campuses"][0]["address"]  # optional fields absent, never null
    profile = client.get("/api/v1/institutions/ins-ls/profile").json()
    assert profile == PROFILES["ey"].model_dump(by_alias=True)
    page = client.get("/api/v1/institutions/ins-ls/calendars").json()
    assert (page["total"], page["page"], page["pageSize"]) == (1, 1, 50)
    assert page["items"][0]["startsOn"] == "2026-06-01"
    assert client.get("/api/v1/institutions/ins-rv/profile").status_code == 404  # another tenant


def test_put_locale_settings_updates_and_audits(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    res = client.put("/api/v1/locale-settings", json=LOCALE, headers=csrf(client))
    assert res.status_code == 200 and res.json() == LOCALE
    assert client.get("/api/v1/locale-settings").json()["supportedLocales"] == ["en-IN", "hi-IN", "ta-IN"]
    assert last_action(test_db.owner_url) == "m01.institution.updated"


def test_invalid_locale_settings_report_every_field(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    bad = {**LOCALE, "defaultLocale": "fr-FR", "timeZone": "Mars/Base"}
    res = client.put("/api/v1/locale-settings", json=bad, headers=csrf(client))
    assert res.status_code == 400 and {"supportedLocales", "timeZone"} <= details(res)
    assert (
        client.put("/api/v1/locale-settings", json={**LOCALE, "currency": "XYZ"}, headers=csrf(client)).status_code
        == 400
    )


def test_teachers_cannot_write(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/tenant").status_code == 200
    res = client.put("/api/v1/locale-settings", json=LOCALE, headers=csrf(client))
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


def test_create_and_update_campus_with_unique_code(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    created = client.post("/api/v1/campuses", json=CAMPUS, headers=csrf(client))
    assert created.status_code == 201 and created.json()["code"] == "KRM"
    assert last_action(test_db.owner_url) == "m01.campus.created"
    dup = client.post("/api/v1/campuses", json=CAMPUS, headers=csrf(client))
    assert dup.status_code == 400 and dup.json()["error"]["details"][0]["path"] == "code"
    campus_id = created.json()["id"]
    renamed = {**CAMPUS, "name": "Little Steps Koramangala North", "timeZone": "Asia/Kolkata"}
    updated = client.put(f"/api/v1/campuses/{campus_id}", json=renamed, headers=csrf(client))
    assert updated.status_code == 200 and updated.json()["name"].endswith("North")
    assert last_action(test_db.owner_url) == "m01.campus.updated"
    assert client.post("/api/v1/campuses", json={**CAMPUS, "code": "bad code"}, headers=csrf(client)).status_code == 400


def test_another_tenants_campus_is_not_found(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    res = client.put("/api/v1/campuses/cmp-rv-north", json=CAMPUS, headers=csrf(client))
    assert res.status_code == 404


def test_calendar_rejects_overlaps_and_saves_valid_changes(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    cal = next(c for c in load_fixtures()["calendars"] if c["id"] == "cal-ls-2026")
    path = "/api/v1/institutions/ins-ls/calendars/cal-ls-2026"
    overlapping = {**cal, "periods": [cal["periods"][0], {**cal["periods"][1], "startsOn": "2026-09-01"}]}
    bad = client.put(path, json=overlapping, headers=csrf(client))
    assert bad.status_code == 400 and "periods.1" in details(bad)
    outside = {**cal, "holidays": [{"date": "2028-01-01", "name": "Later"}]}
    assert "holidays.0.date" in details(client.put(path, json=outside, headers=csrf(client)))
    good = {**cal, "holidays": [*cal["holidays"], {"date": "2026-11-08", "name": "दीपावली"}]}
    ok = client.put(path, json=good, headers=csrf(client))
    assert ok.status_code == 200 and ok.json()["holidays"][-1]["name"] == "दीपावली"
    assert (
        client.get("/api/v1/institutions/ins-ls/calendars").json()["items"][0]["holidays"][-1]["date"] == "2026-11-08"
    )


def test_profiles_match_the_mocks() -> None:
    from pathlib import Path

    source = (Path(__file__).parents[3] / "frontend/packages/mocks/src/fixtures/profiles.ts").read_text("utf-8")
    for p in PROFILES.values():
        assert f'type: "{p.type}"' in source and f'gradingScheme: "{p.grading_scheme}"' in source
