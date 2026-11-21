"""Shared sign-in fixtures for API tests: a fake Keycloak and an app client on the test database."""

import asyncio
from collections.abc import Iterator
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from nexus.core.vault import FakeVault
from nexus.main import create_app
from nexus.modules.m02.keycloak_admin import FakeKeycloakAdmin
from nexus.modules.m02.login_state import MemoryLoginStateStore
from nexus.modules.m02.oidc import OidcClient
from nexus.settings import Settings
from tests.fake_keycloak import BASE, CLIENT_ID, SECRET, FakeKeycloak

if TYPE_CHECKING:  # conftest imports this module: no runtime import back (import-order safe)
    from tests.db.conftest import DbUrls

PRIYA = {"email": "priya.raman@littlesteps.example.edu", "user": "usr-ls-priya", "person": "per-ls-priya"}


@pytest.fixture
def kc() -> FakeKeycloak:
    return FakeKeycloak()


@pytest.fixture
def client(test_db: "DbUrls", kc: FakeKeycloak) -> Iterator[TestClient]:
    settings = Settings(
        environment="test",
        region="in",
        database_url=test_db.app_url,  # type: ignore[arg-type]
        redis_url="redis://127.0.0.1:1/0",  # type: ignore[arg-type]
        keycloak_url=BASE.split("/realms/")[0],
        oidc_client_id=CLIENT_ID,
        oidc_client_secret=SECRET,  # type: ignore[arg-type]
        api_public_url="https://testserver",
        app_public_url="https://app.test",
    )
    app = create_app(settings)
    app.state.oidc = OidcClient(settings, kc.client())
    app.state.login_states = MemoryLoginStateStore()
    app.state.keycloak_admin = FakeKeycloakAdmin()
    app.state.vault = FakeVault()
    with TestClient(
        app,
        base_url="https://testserver",  # Secure cookies are only sent back over https
        raise_server_exceptions=False,
        backend_options={"loop_factory": asyncio.SelectorEventLoop},
    ) as c:
        yield c


def sign_in(client: TestClient, kc: FakeKeycloak, return_to: str = "/access", **claims: Any) -> Any:
    start = client.get("/api/v1/auth/login", params={"returnTo": return_to}, follow_redirects=False)
    assert start.status_code == 302
    query = parse_qs(urlparse(start.headers["location"]).query)
    assert query["code_challenge_method"] == ["S256"] and query["client_id"] == [CLIENT_ID]
    kc.claims = {
        "sub": "kc-priya",
        "nonce": query["nonce"][0],
        "email": PRIYA["email"],
        "email_verified": True,
        "organization": ["ten-ls"],
        **claims,
    }
    return client.get(
        "/api/v1/auth/callback", params={"code": "code-1", "state": query["state"][0]}, follow_redirects=False
    )
