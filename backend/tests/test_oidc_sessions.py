import time

import pytest

from nexus.core.errors import ApiError
from nexus.core.sessions import device_label, parse_cookie, token_hash
from nexus.modules.m02.auth import safe_return_to
from nexus.modules.m02.oidc import OidcClient, pkce_pair
from nexus.settings import Settings
from tests.fake_keycloak import BASE, CLIENT_ID, FakeKeycloak

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def oidc(kc: FakeKeycloak) -> OidcClient:
    settings = Settings(environment="test", keycloak_url=BASE.split("/realms/")[0], oidc_client_id=CLIENT_ID)
    return OidcClient(settings, kc.client())


async def test_valid_token_is_accepted_and_bound_to_the_nonce() -> None:
    kc = FakeKeycloak()
    kc.claims = {"sub": "s", "nonce": "n1"}
    claims = await oidc(kc).verify_id_token(kc.id_token(), nonce="n1")
    assert claims["sub"] == "s"
    with pytest.raises(ApiError):
        await oidc(kc).verify_id_token(kc.id_token(), nonce="other")


@pytest.mark.parametrize(
    "overrides",
    [{"iss": "http://evil/realms/x"}, {"aud": "someone-else"}, {"exp": int(time.time()) - 3600}],
)
async def test_wrong_issuer_audience_or_expiry_is_refused(overrides: dict[str, object]) -> None:
    kc = FakeKeycloak()
    kc.claims = {"sub": "s", "nonce": "n"}
    with pytest.raises(ApiError) as refused:
        await oidc(kc).verify_id_token(kc.id_token(**overrides), nonce="n")
    assert refused.value.status == 401


async def test_rotated_signing_key_is_fetched_again() -> None:
    kc = FakeKeycloak()
    kc.claims = {"sub": "s", "nonce": "n"}
    client = oidc(kc)
    await client.verify_id_token(kc.id_token(), nonce="n")
    kc.kid = "test-key-2"  # Keycloak rotated its key
    assert (await client.verify_id_token(kc.id_token(), nonce="n"))["sub"] == "s"


def test_pkce_challenge_is_s256_of_the_verifier() -> None:
    import base64
    import hashlib

    verifier, challenge = pkce_pair()
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert challenge == digest and 43 <= len(verifier) <= 128


def test_cookie_parsing_and_token_hash() -> None:
    assert parse_cookie("ten-ls.ses_1.tok") is not None
    for bad in (None, "", "a.b", "a..c", "a.b.c.d"):
        assert parse_cookie(bad) is None
    assert len(token_hash("x")) == 64


def test_return_to_only_allows_app_paths() -> None:
    assert safe_return_to("/access?tab=roles") == "/access?tab=roles"
    for bad in (None, "", "https://evil.example", "//evil.example", "/\\evil"):
        assert safe_return_to(bad) == "/"


def test_device_label_has_no_versions() -> None:
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0"
    assert device_label(ua) == "Edge · Windows"
    assert device_label(None) == "Browser · Unknown device"
