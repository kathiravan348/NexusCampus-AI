"""Compiled text bundle (NEX-054): overrides only, per layer, ETag revalidation."""

from fastapi.testclient import TestClient

from tests.db.auth_fixtures import sign_in
from tests.db.m04.helpers import LOCALE, csrf
from tests.fake_keycloak import FakeKeycloak

URL = "/api/v1/texts/bundle"


def test_bundle_has_the_tenants_overrides_and_an_etag(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    put = client.put(
        "/api/v1/texts/overrides/common.loading",
        params={"locale": LOCALE},
        json={"message": "Wait…"},
        headers=csrf(client),
    )
    assert put.status_code == 200
    res = client.get(URL, params={"locale": LOCALE})
    assert res.status_code == 200 and res.headers["etag"] == res.json()["etag"]
    body = res.json()
    assert body["institutions"]["ins-ls"]["common.loading"] == "Wait…" and body["campuses"] == {}
    assert client.get(URL, params={"locale": LOCALE}, headers={"If-None-Match": body["etag"]}).status_code == 304
    client.put(
        "/api/v1/texts/overrides/common.loading",
        params={"locale": LOCALE},
        json={"message": "Loading"},
        headers=csrf(client),
    )
    fresh = client.get(URL, params={"locale": LOCALE}, headers={"If-None-Match": body["etag"]})
    assert fresh.status_code == 200 and fresh.json()["etag"] != body["etag"]
    assert client.get(URL, params={"locale": "ta-IN"}).json()["institutions"] == {}


def test_bundle_needs_a_locale(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    assert client.get(URL).status_code == 400
    assert client.get(URL, params={"locale": "en_IN"}).status_code == 400
