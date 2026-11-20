"""Consents (NEX-052, M06, G-6): staff see all, a guardian only their family's."""

from fastapi.testclient import TestClient
from tests.db.auth_fixtures import sign_in
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
SUNITA = {"email": "sunita.rao@family.test", "sub": "kc-sunita"}


def test_staff_see_every_consent(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/consents").json()
    assert page["total"] == 5 and {c["tenantId"] for c in page["items"]} == {"ten-ls"}
    withdrawn = [c for c in page["items"] if c["status"] == "withdrawn"]
    assert len(withdrawn) == 1 and withdrawn[0]["withdrawnAt"] == "2026-09-08T11:20:00Z"


def test_guardian_sees_own_family_only(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **SUNITA)
    page = client.get("/api/v1/consents").json()
    assert {c["personId"] for c in page["items"]} == {"per-ls-rohan", "per-ls-ishaan"} and page["total"] == 2


def test_teacher_guardian_with_user_read_sees_all(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/consents").json()["total"] == 5
