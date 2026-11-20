"""SSO providers and SCIM 2.0 (NEX-049)."""

from typing import Any

from fastapi.testclient import TestClient

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.devtools.scim_token import issue
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

PROVIDER = {
    "institutionId": None,
    "protocol": "oidc",
    "name": "Little Steps Google",
    "issuerUrl": "https://accounts.example.com",
    "clientId": "ls-client",
    "domains": ["littlesteps.example.in"],
    "scimEnabled": True,
    "enabled": True,
}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def kc_admin(c: TestClient) -> Any:
    return c.app.state.keycloak_admin  # type: ignore[attr-defined]


def test_save_provider_over_https_and_update_in_place(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    res = client.post("/api/v1/sso-providers", json=PROVIDER, headers=csrf(client))
    assert res.status_code == 201, res.text
    provider = res.json()
    assert provider["name"] == "Little Steps Google" and "secret" not in str(provider).lower()
    assert f"ten-ls-{provider['id']}" in kc_admin(client).providers
    bad = client.post("/api/v1/sso-providers", json={**PROVIDER, "issuerUrl": "http://x.example"}, headers=csrf(client))
    assert bad.status_code == 400 and bad.json()["error"]["details"][0]["path"] == "issuerUrl"
    upper = client.post("/api/v1/sso-providers", json={**PROVIDER, "domains": ["LS.Example.in"]}, headers=csrf(client))
    assert upper.status_code == 400
    renamed = client.put(
        f"/api/v1/sso-providers/{provider['id']}",
        json={**PROVIDER, "name": "Google Workspace"},
        headers=csrf(client),
    )
    assert renamed.status_code == 200 and renamed.json()["id"] == provider["id"]
    names = [p["name"] for p in client.get("/api/v1/sso-providers").json()["items"]]
    assert names.count("Google Workspace") == 1 and "Little Steps Google" not in names


def scim(client: TestClient, token: str, method: str, path: str, body: Any = None) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    return client.request(method, f"/scim/v2{path}", headers=headers, json=body)


def test_scim_provisioning_lifecycle(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    client.post("/api/v1/sso-providers", json=PROVIDER, headers=csrf(client))  # SCIM on for Little Steps
    token = issue(test_db.owner_url, "ten-ls")
    created = scim(
        client,
        token,
        "POST",
        "/Users",
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": "Anil.Kumar@littlesteps.example.in",
            "name": {"givenName": "Anil", "familyName": "Kumar"},
        },
    )
    assert created.status_code == 201, created.text
    user = created.json()
    assert user["userName"] == "anil.kumar@littlesteps.example.in" and user["active"] is False  # invited
    found = scim(client, token, "GET", '/Users?filter=userName eq "anil.kumar@littlesteps.example.in"').json()
    assert found["totalResults"] == 1 and found["Resources"][0]["id"] == user["id"]
    dup = scim(client, token, "POST", "/Users", {"userName": "anil.kumar@littlesteps.example.in"})
    assert dup.status_code == 409 and dup.json()["scimType"] == "uniqueness"
    patch = {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        "Operations": [{"op": "replace", "path": "active", "value": False}],
    }
    off = scim(client, token, "PATCH", f"/Users/{user['id']}", patch)
    assert off.status_code == 200 and off.json()["active"] is False
    assert kc_admin(client).enabled["anil.kumar@littlesteps.example.in"] is False
    assert scim(client, token, "DELETE", f"/Users/{user['id']}").status_code == 204
    assert scim(client, token, "GET", "/Users/usr-rv-helen").status_code == 404  # other tenant


def test_scim_needs_a_valid_token_and_never_leaks_it(client: TestClient, test_db: DbUrls) -> None:
    token = issue(test_db.owner_url, "ten-ls")
    tenant, token_id, secret = token.split(".")
    for bad in ("", "Bearer nope", f"Bearer {tenant}.{token_id}.wrong", f"Bearer ten-ax.{token_id}.{secret}"):
        res = client.get("/scim/v2/Users", headers={"Authorization": bad} if bad else {})
        assert res.status_code == 401, bad
        assert res.json()["schemas"] == ["urn:ietf:params:scim:api:messages:2.0:Error"]
        assert secret not in res.text
