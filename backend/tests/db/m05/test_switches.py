"""Module switches (NEX-055, M05, ideology §2.2): optional only, effective on the next request, audited."""

from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from nexus.core.permissions import Authorized, require
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import last_action
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def add_sync_probe(app: FastAPI) -> None:
    @app.get("/probe/sync")
    async def sync(auth: Annotated[Authorized, Depends(require(None, "M10"))]) -> dict[str, str]:
        return {"user": auth.ctx.user_id}


def test_switch_off_hides_the_module_at_once(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    add_sync_probe(client.app)  # type: ignore[arg-type]
    sign_in(client, kc)
    assert client.get("/probe/sync").status_code == 200
    off = client.patch("/api/v1/entitlements/M10", json={"enabled": False}, headers=csrf(client))
    assert off.status_code == 200 and off.json()["enabled"] is False
    assert last_action(test_db.owner_url) == "m05.module.disabled"
    probe = client.get("/probe/sync")
    assert probe.status_code == 403 and probe.json()["error"]["code"] == "module_disabled"
    on = client.patch("/api/v1/entitlements/M10", json={"enabled": True}, headers=csrf(client))
    assert on.status_code == 200 and client.get("/probe/sync").status_code == 200
    assert last_action(test_db.owner_url) == "m05.module.enabled"


def test_core_and_unplanned_modules_cannot_be_switched(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    core = client.patch("/api/v1/entitlements/M02", json={"enabled": False}, headers=csrf(client))
    assert core.status_code == 409 and core.json()["error"]["details"][0]["path"] == "enabled"
    unplanned = client.patch("/api/v1/entitlements/M29", json={"enabled": True}, headers=csrf(client))
    assert unplanned.status_code == 403 and unplanned.json()["error"]["code"] == "module_disabled"
    bad = client.patch("/api/v1/entitlements/M10", json={"enabled": "yes", "x": 1}, headers=csrf(client))
    assert bad.status_code == 400


def test_teachers_cannot_switch(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.patch("/api/v1/entitlements/M10", json={"enabled": False}, headers=csrf(client)).status_code == 403
