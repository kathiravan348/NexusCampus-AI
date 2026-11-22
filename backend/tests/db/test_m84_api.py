"""M84 on real data (NEX-105): the install agent as `nexus_app`, then the Install & updates API for an admin."""

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.agent.licence import LICENCE_FILE, LICENCE_KEYS
from nexus.agent.state import run_once
from nexus.core.vault import FakeVault
from nexus.licensing.licence import LicenceTerms, issue_licence
from nexus.releases.manifest import public_key_file
from nexus.settings import Settings
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def install(tmp_path: Path, test_db: DbUrls) -> Iterator[tuple[Settings, dict[str, int]]]:
    """A signed licence in an install folder, one agent run against the test database; cleaned up afterwards."""
    import asyncio

    vault = FakeVault()

    async def licence() -> None:
        terms = LicenceTerms.model_validate(
            {
                "id": "lic-test",
                "accountId": "acc-test",
                "edition": "enterprise",
                "modules": ["M01", "M84"],
                "learnerCap": 5000,
                "campusCap": 9,
                "issuedAt": "2026-01-01T00:00:00Z",
                "expiresAt": None,
                "supportEndsAt": "2027-12-31",
                "graceDays": 30,
                "activation": "offline",
                "signingKeyId": "pending",
            }
        )
        file = await issue_licence(terms, vault, "nexus-licence")
        (tmp_path / LICENCE_FILE).write_text(file.to_json(), encoding="utf-8")
        keys = await public_key_file(vault, "nexus-licence")
        (tmp_path / LICENCE_KEYS).write_text(json.dumps(keys), encoding="utf-8")

    asyncio.run(licence())
    settings = Settings(install_mode="self_hosted", install_dir=tmp_path, install_id="ins-test")
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            result = run_once(conn, settings)
        yield settings, {"learners": result.learners, "campuses": result.campuses, "tenants": result.tenants}
    finally:
        app.dispose()
        owner = create_engine(test_db.owner_url)
        with owner.begin() as conn:  # the test database is shared: leave it as found
            conn.execute(text("DELETE FROM entitlements WHERE module_id = 'M84'"))
            conn.execute(text("DELETE FROM install_status"))
        owner.dispose()


def self_hosted(client: TestClient, settings: Settings) -> None:
    app = client.app
    app.state.settings = app.state.settings.model_copy(  # type: ignore[attr-defined]
        update={"install_mode": "self_hosted", "install_dir": settings.install_dir}
    )


def test_admin_sees_the_install(client: TestClient, kc: FakeKeycloak, install: tuple[Settings, dict[str, int]]) -> None:
    settings, counts = install
    assert counts["tenants"] >= 1 and counts["campuses"] >= 1
    self_hosted(client, settings)
    sign_in(client, kc)
    status = client.get("/api/v1/install/status")
    assert status.status_code == 200, status.text
    body = status.json()
    assert (body["installId"], body["airGapped"], body["telemetryEnabled"]) == ("ins-test", False, True)
    licence = body["licence"]
    assert (licence["edition"], licence["state"], licence["expiresAt"]) == ("enterprise", "active", None)
    assert (licence["learnersUsed"], licence["campusesUsed"]) == (counts["learners"], counts["campuses"])
    assert client.get("/api/v1/install/update").json() == {"offer": None}
    assert client.get("/api/v1/install/backups").json()["total"] == 0
    assert client.get("/api/v1/install/diagnostics").json()["total"] == 0
    modules = {e["moduleId"] for e in client.get("/api/v1/entitlements", params={"pageSize": 200}).json()["items"]}
    assert "M84" in modules


def test_teacher_and_saas_are_refused(
    client: TestClient, kc: FakeKeycloak, install: tuple[Settings, dict[str, int]]
) -> None:
    sign_in(client, kc)
    saas = client.get("/api/v1/install/status")  # the client starts as a SaaS cell
    assert saas.status_code == 403 and saas.json()["error"]["code"] == "module_disabled"
    self_hosted(client, install[0])
    client.cookies.clear()
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/install/status").status_code == 403
