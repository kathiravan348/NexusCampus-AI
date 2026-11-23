"""Staff sign-in with mandatory MFA (NEX-097), against the fake Keycloak at the HTTP boundary."""

from collections.abc import Iterator
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from fastapi.testclient import TestClient

from nexus.control.main import create_app
from nexus.control.sessions import SESSION_COOKIE, MemorySessionStore
from nexus.control.settings import ControlSettings
from nexus.modules.m02.login_state import MemoryLoginStateStore
from tests.control.test_app import FakeStore
from tests.fake_keycloak import BASE, CLIENT_ID, SECRET, FakeKeycloak

API = "/control/api/v1"
NISHA = "nisha.verma@nexuscampus.example"


@pytest.fixture
def kc() -> FakeKeycloak:
    return FakeKeycloak()


@pytest.fixture
def control(kc: FakeKeycloak) -> Iterator[TestClient]:
    settings = ControlSettings(
        environment="prod",  # the dev header is off: only real sessions work
        keycloak_url=BASE.split("/realms/")[0],
        keycloak_realm=BASE.split("/realms/")[1],
        oidc_client_id=CLIENT_ID,
        oidc_client_secret=SECRET,  # type: ignore[arg-type]
        api_public_url="https://testserver",
        app_public_url="https://control.test",
    )
    app = create_app(
        settings,
        staff_store=FakeStore(),
        session_store=MemorySessionStore(),
        http=kc.client(),
        login_states=MemoryLoginStateStore(),
    )
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as c:
        yield c


def start_login(control: TestClient) -> tuple[str, str, dict[str, list[str]]]:
    res = control.get(f"{API}/auth/login?returnTo=/accounts", follow_redirects=False)
    assert res.status_code == 302
    query = parse_qs(urlparse(res.headers["location"]).query)
    return query["state"][0], query["nonce"][0], query


def finish(control: TestClient, kc: FakeKeycloak, state: str, nonce: str, **claims: object) -> httpx2.Response:
    kc.claims = {"sub": "kc-1", "nonce": nonce, "email_verified": True, **claims}
    return control.get(f"{API}/auth/callback?code=abc&state={state}", follow_redirects=False)


def test_login_asks_for_mfa_with_pkce(control: TestClient) -> None:
    _, _, query = start_login(control)
    assert query["acr_values"] == ["mfa"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid email profile"]
    assert query["redirect_uri"] == ["https://testserver/control/api/v1/auth/callback"]


def test_mfa_sign_in_creates_a_session_and_sign_out_revokes_it(control: TestClient, kc: FakeKeycloak) -> None:
    state, nonce, _ = start_login(control)
    res = finish(control, kc, state, nonce, email=NISHA, acr="mfa")
    assert res.status_code == 302
    assert res.headers["location"] == "https://control.test/accounts"
    cookie = res.headers["set-cookie"]
    assert SESSION_COOKIE in cookie and "HttpOnly" in cookie and "Path=/control" in cookie and "Secure" in cookie
    assert "SameSite=strict" in cookie.lower() or "samesite=strict" in cookie.lower()
    token = res.cookies[SESSION_COOKIE]
    me = control.get(f"{API}/me", cookies={SESSION_COOKIE: token})
    assert me.status_code == 200
    assert me.json()["staff"]["displayName"] == "Nisha Verma"
    assert control.post(f"{API}/auth/logout", cookies={SESSION_COOKIE: token}).status_code == 403
    assert (
        control.post(
            f"{API}/auth/logout", cookies={SESSION_COOKIE: token}, headers={"Origin": "https://control.test"}
        ).status_code
        == 200
    )
    assert control.get(f"{API}/me", cookies={SESSION_COOKIE: token}).status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"email": NISHA, "acr": "1"},  # password only
        {"email": NISHA},  # no acr at all
        {"email": "nobody@nexuscampus.example", "acr": "mfa"},  # not staff
        {"email": NISHA, "acr": "mfa", "email_verified": False},
    ],
)
def test_refused_sign_ins_create_no_session(control: TestClient, kc: FakeKeycloak, claims: dict[str, object]) -> None:
    state, nonce, _ = start_login(control)
    res = finish(control, kc, state, nonce, **claims)
    assert res.status_code == 401
    assert SESSION_COOKIE not in res.headers.get("set-cookie", "")


def test_wrong_state_or_nonce_and_no_dev_header_in_prod(control: TestClient, kc: FakeKeycloak) -> None:
    state, _, _ = start_login(control)
    assert finish(control, kc, "forged", "x", email=NISHA, acr="mfa").status_code == 401
    assert finish(control, kc, state, "wrong-nonce", email=NISHA, acr="mfa").status_code == 401
    assert control.get(f"{API}/me", headers={"X-Nexus-Staff": "stf-0001"}).status_code == 401
