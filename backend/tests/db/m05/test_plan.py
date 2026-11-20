"""Plan and entitlements (NEX-055, M05)."""

from fastapi.testclient import TestClient

from tests.db.auth_fixtures import sign_in
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


def test_plan_is_the_tenants(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    plan = client.get("/api/v1/plan").json()
    assert plan["code"] == "standard" and plan["nameKey"] == "m05.plan.standard"
    assert plan["modules"] == ["M10", "M11"] and plan["aiCreditsPerMonth"] == 500 and plan["learnerLimit"] == 2000


def test_every_user_gets_the_module_switches(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/plan").status_code == 403
    page = client.get("/api/v1/entitlements").json()
    switches = {e["moduleId"]: (e["enabled"], e["source"]) for e in page["items"]}
    assert switches["M01"] == (True, "core") and switches["M11"] == (False, "plan") and page["total"] == 10
    assert set(page["items"][0]) == {"tenantId", "moduleId", "enabled", "source", "expiresAt"}
