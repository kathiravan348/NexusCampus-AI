"""Sign-in (NEX-045, D44): login → Keycloak (faked at the HTTP boundary) → callback → session cookie → /me →
logout, against the real schema with RLS.
"""

from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE
from tests.db.auth_fixtures import PRIYA, sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import BASE, FakeKeycloak


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def audit_actions(owner_url: str, user_id: str) -> list[str]:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT action FROM audit_events WHERE actor_id = :u ORDER BY seq"), {"u": user_id}
        ).scalars()
        result = list(rows)
    engine.dispose()
    return result


def test_full_sign_in_me_and_sign_out(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    done = sign_in(client, kc)
    assert done.status_code == 302 and done.headers["location"] == "https://app.test/access"
    set_cookie = done.headers.get_list("set-cookie")
    session_cookie = next(c for c in set_cookie if c.startswith(f"{SESSION_COOKIE}="))
    assert "HttpOnly" in session_cookie and "Secure" in session_cookie and "SameSite=lax" in session_cookie
    assert kc.token_requests[0]["code_verifier"]  # PKCE verifier was sent

    me = client.get("/api/v1/me")
    assert me.status_code == 200
    body = me.json()
    assert set(body) == {"user", "person", "roleProfiles", "assignments", "permissions"}
    assert body["user"]["id"] == PRIYA["user"] and body["person"]["id"] == PRIYA["person"]
    assert body["user"]["createdAt"].endswith("Z") and body["roleProfiles"]

    assert client.post("/api/v1/auth/logout").status_code == 403  # no CSRF token
    out = client.post("/api/v1/auth/logout", headers=csrf(client))
    assert out.status_code == 200 and out.json()["logoutUrl"].startswith(BASE)
    assert client.get("/api/v1/me").status_code == 401
    assert audit_actions(test_db.owner_url, PRIYA["user"])[-2:] == ["m02.user.signedIn", "m02.user.signedOut"]


def test_tenant_comes_only_from_the_session(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    # A forged tenant header is ignored: /me answers for the session's own tenant.
    me = client.get("/api/v1/me", headers={"X-Nexus-Tenant": "ten-ax", "X-Nexus-User": "usr-ax-karthik"})
    assert me.json()["user"]["tenantId"] == "ten-ls"
    # Swapping the tenant part of the cookie finds nothing under the other tenant's RLS.
    tenant, session_id, token = (client.cookies.get(SESSION_COOKIE) or "").split(".")
    client.cookies.set(SESSION_COOKIE, f"ten-ax.{session_id}.{token}", domain="testserver.local")
    assert client.get("/api/v1/me").status_code == 401
    client.cookies.set(SESSION_COOKIE, f"{tenant}.{session_id}.{token}x", domain="testserver.local")
    assert client.get("/api/v1/me").status_code == 401


def test_expired_session_is_refused(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    session_id = (client.cookies.get(SESSION_COOKIE) or "").split(".")[1]
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE sessions SET created_at = created_at - interval '2 hours', "
                "expires_at = created_at - interval '1 hour' WHERE id = :id"
            ),
            {"id": session_id},
        )
    engine.dispose()
    assert client.get("/api/v1/me").status_code == 401


def test_a_state_can_only_be_used_once(client: TestClient, kc: FakeKeycloak) -> None:
    start = client.get("/api/v1/auth/login", follow_redirects=False)
    query = parse_qs(urlparse(start.headers["location"]).query)
    kc.claims = {
        "sub": "kc-priya",
        "nonce": query["nonce"][0],
        "email": PRIYA["email"],
        "email_verified": True,
        "organization": ["ten-ls"],
    }
    params = {"code": "c", "state": query["state"][0]}
    assert client.get("/api/v1/auth/callback", params=params, follow_redirects=False).status_code == 302
    assert client.get("/api/v1/auth/callback", params=params, follow_redirects=False).status_code == 400


@pytest.mark.parametrize(
    ("claims", "status"),
    [
        ({"nonce": "wrong"}, 401),  # ID token not bound to this login
        ({"organization": []}, 403),  # no institution
        ({"email": "nobody@example.edu", "sub": "kc-nobody"}, 403),  # no NexusCampus account
        ({"email": "deepak.iyer@family.test", "sub": "kc-deepak"}, 403),  # invited, not active
        ({"organization": ["ten-rv"], "email": "helen.carter@riverside.example.edu", "sub": "kc-helen"}, 503),
    ],
)
def test_refused_sign_ins(client: TestClient, kc: FakeKeycloak, claims: dict[str, Any], status: int) -> None:
    assert sign_in(client, kc, **claims).status_code == status
    assert client.cookies.get(SESSION_COOKIE) is None


def test_open_redirects_are_neutralised(client: TestClient, kc: FakeKeycloak) -> None:
    assert sign_in(client, kc, return_to="//evil.example").headers["location"] == "https://app.test/"
