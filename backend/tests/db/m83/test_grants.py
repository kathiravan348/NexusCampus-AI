"""Grant credentials (NEX-051, V-3): scoped to the grant's modules and mode, stop on expiry and revoke, every use
audited as the grant; sensitive permissions are never reachable."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from nexus.modules.m83.grant_auth import GrantSigner
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m83.helpers import (
    STAFF,
    bearer,
    credential,
    csrf,
    file_request,
    grant_audit,
    granted,
    owner_execute,
    request_of,
)
from tests.fake_keycloak import FakeKeycloak


def test_read_grant_reaches_its_module_only(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M02"])
    client.cookies.clear()  # from here on, only the provider's credential
    auth = bearer(token)
    assert client.get("/api/v1/users", headers=auth).status_code == 200
    assert client.get("/api/v1/tenant", headers=auth).status_code == 403  # M01 not granted
    assert client.get("/api/v1/access-requests", headers=auth).status_code == 403  # M83 not granted
    invite = client.post("/api/v1/users/invite", json={}, headers=auth)  # read-only grant
    assert invite.status_code == 403 and invite.json()["error"]["code"] == "forbidden"
    assert client.get("/api/v1/me", headers=auth).status_code == 401  # M02, but a grant is not a user
    uses = grant_audit(test_db.owner_url, grant["id"])
    used, refused = "m83.accessGrant.used", "m83.accessGrant.refused"
    assert [a for a, _, _ in uses] == [used, refused, refused, refused, used]
    assert {(kind, actor) for _, kind, actor in uses} == {("provider_grant", STAFF)}


def test_revoke_takes_effect_on_the_next_request(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M02"])
    assert client.get("/api/v1/users", headers=bearer(token)).status_code == 200
    revoked = client.post(f"/api/v1/access-grants/{grant['id']}/revoke", headers=csrf(client))
    assert revoked.status_code == 200 and revoked.json()["revokedAt"] is not None
    assert client.get("/api/v1/users", headers=bearer(token)).status_code == 403
    assert client.post(f"/api/v1/access-grants/{grant['id']}/revoke", headers=csrf(client)).status_code == 409
    assert credential(client, grant["id"]).status_code == 409
    assert request_of(client, grant["requestId"])["status"] == "revoked"


def test_expired_grant_stops_working(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M02"])
    owner_execute(
        test_db.owner_url,
        "UPDATE access_grants SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' "
        "WHERE id = :g",
        {"g": grant["id"]},
    )
    assert client.get("/api/v1/users", headers=bearer(token)).status_code == 403
    assert credential(client, grant["id"]).status_code == 409
    assert request_of(client, grant["requestId"])["status"] == "expired"
    assert client.post(f"/api/v1/access-grants/{grant['id']}/revoke", headers=csrf(client)).status_code == 409


def test_edit_grant_writes_are_audited_as_the_grant(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M01"], "edit")
    client.cookies.clear()
    locale = client.get("/api/v1/locale-settings", headers=bearer(token))
    assert locale.status_code == 200
    assert client.put("/api/v1/locale-settings", json=locale.json(), headers=bearer(token)).status_code == 200
    uses = grant_audit(test_db.owner_url, grant["id"])
    assert [a for a, _, _ in uses] == ["m83.accessGrant.used", "m83.accessGrant.used", "m01.institution.updated"]
    assert {(kind, actor) for _, kind, actor in uses} == {("provider_grant", STAFF)}


def test_sensitive_permissions_are_never_on_a_grant(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    pending = file_request(client, ["M02"])
    _, token = granted(client, ["M83", "M02"], "edit")
    client.cookies.clear()
    assert client.get("/api/v1/vault/keys", headers=bearer(token)).status_code == 200
    res = client.post(
        f"/api/v1/access-requests/{pending['id']}/approve",
        json={"modules": ["M02"], "mode": "read", "durationHours": 1},
        headers=bearer(token),
    )
    assert res.status_code == 403  # a provider can never approve provider access


def test_forged_expired_and_borrowed_credentials(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M02"])
    client.cookies.clear()
    head, _, sig = token.rpartition(".")
    tampered = head.replace(".ten-ls.", ".ten-ax.") + "." + sig
    for bad in (tampered, head + ".AAAA", "ngc1.x", token + "x"):
        assert client.get("/api/v1/users", headers=bearer(bad)).status_code == 401
    soon = datetime.now(UTC) + timedelta(minutes=5)
    other_key = GrantSigner(b"k" * 32).issue("ten-ls", grant["id"], STAFF, soon)
    assert client.get("/api/v1/users", headers=bearer(other_key)).status_code == 401
    signer: GrantSigner = client.app.state.grant_signer  # type: ignore[attr-defined]
    stale = signer.issue("ten-ls", grant["id"], STAFF, datetime.now(UTC) - timedelta(seconds=1))
    assert client.get("/api/v1/users", headers=bearer(stale)).status_code == 401
    borrowed = signer.issue("ten-ls", grant["id"], "stf-9999", soon)
    assert client.get("/api/v1/users", headers=bearer(borrowed)).status_code == 403
    assert credential(client, grant["id"], staff="stf-9999").status_code == 404
