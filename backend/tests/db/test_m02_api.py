"""M02 API (NEX-048): backend twins of the mock's `handlers/m02.test.ts` cases, plus masking and Keycloak."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
SUNITA = {"email": "sunita.rao@family.test", "sub": "kc-sunita"}
TEACHER_ROLE = "role-ls-teacher"


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def audit_actions(owner_url: str, n: int = 3) -> list[str]:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT :n"),
            {"n": n},
        ).scalars()
        out = list(rows)
    engine.dispose()
    return out


def kc_admin(c: TestClient) -> Any:
    return c.app.state.keycloak_admin  # type: ignore[attr-defined]


def test_invite_creates_person_user_assignment_and_keycloak_account(
    client: TestClient, kc: FakeKeycloak, test_db: DbUrls
) -> None:
    sign_in(client, kc)
    body = {
        "legalName": "Meera Pillai",
        "email": "Meera.Pillai@littlesteps.example.edu",
        "roleId": TEACHER_ROLE,
        "scope": {"kind": "campus", "targetId": "cmp-ls-main"},
    }
    res = client.post("/api/v1/users/invite", json=body, headers=csrf(client))
    assert res.status_code == 201, res.text
    user = res.json()
    assert user["status"] == "invited" and user["email"] == "meera.pillai@littlesteps.example.edu"
    assert ("ten-ls", "meera.pillai@littlesteps.example.edu") in kc_admin(client).invited
    assert audit_actions(test_db.owner_url, 1) == ["m02.user.invited"]
    assignments = client.get("/api/v1/role-assignments", params={"pageSize": 200}).json()["items"]
    assert any(a["userId"] == user["id"] and a["scope"]["kind"] == "campus" for a in assignments)


def test_duplicate_email_and_disallowed_scope(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    dup = {
        "legalName": "Priya",
        "email": "priya.raman@littlesteps.example.edu",
        "roleId": TEACHER_ROLE,
        "scope": {"kind": "campus", "targetId": "cmp-ls-main"},
    }
    res = client.post("/api/v1/users/invite", json=dup, headers=csrf(client))
    assert res.status_code == 409 and res.json()["error"]["details"][0]["path"] == "email"
    bad = {**dup, "email": "new.person@littlesteps.example.edu", "scope": {"kind": "own", "targetId": None}}
    res = client.post("/api/v1/users/invite", json=bad, headers=csrf(client))
    assert res.status_code == 400 and res.json()["error"]["details"][0]["path"] == "scope.kind"


def test_keycloak_outage_rolls_the_invite_back(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    kc_admin(client).fail = True
    body = {
        "legalName": "Ravi K",
        "email": "ravi.k@littlesteps.example.edu",
        "roleId": TEACHER_ROLE,
        "scope": {"kind": "campus", "targetId": "cmp-ls-main"},
    }
    assert client.post("/api/v1/users/invite", json=body, headers=csrf(client)).status_code == 503
    users = client.get("/api/v1/users", params={"pageSize": 200}).json()["items"]
    assert all(u["email"] != "ravi.k@littlesteps.example.edu" for u in users)


def test_custom_roles_and_read_only_system_roles(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    role = {
        "name": "Front office",
        "permissions": ["m02.user.read", "m07.notification.send"],
        "allowedScopeKinds": ["campus"],
    }
    created = client.post("/api/v1/roles", json=role, headers=csrf(client))
    assert created.status_code == 201 and created.json()["system"] is False
    rid = created.json()["id"]
    edited = client.put(f"/api/v1/roles/{rid}", json={**role, "name": "Front desk"}, headers=csrf(client))
    assert edited.status_code == 200 and edited.json()["name"] == "Front desk"
    assert client.put(f"/api/v1/roles/{TEACHER_ROLE}", json=role, headers=csrf(client)).status_code == 409
    unknown = client.post(
        "/api/v1/roles", json={**role, "permissions": ["m02.user.fly"]}, headers=csrf(client)
    )
    assert unknown.status_code == 400
    assert client.get("/api/v1/permissions").json()["total"] == 24


def test_assign_and_never_remove_your_own_last_admin_role(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    body = {
        "userId": "usr-ls-deepak",
        "roleId": TEACHER_ROLE,
        "scope": {"kind": "institution", "targetId": "ins-ls"},
        "effectiveFrom": "2026-11-01",
        "effectiveTo": None,
    }
    res = client.post("/api/v1/role-assignments", json=body, headers=csrf(client))
    assert res.status_code == 201 and res.json()["scope"] == {"kind": "institution", "targetId": "ins-ls"}
    backwards = {**body, "effectiveTo": "2026-10-01"}
    assert client.post("/api/v1/role-assignments", json=backwards, headers=csrf(client)).status_code == 400
    assert (
        client.delete("/api/v1/role-assignments/ra-ls-priya-admin", headers=csrf(client)).status_code == 204
    )
    last = client.delete("/api/v1/role-assignments/ra-ls-priya-owner", headers=csrf(client))
    assert last.status_code == 409


def test_suspend_and_reactivate_others_but_never_yourself(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    res = client.put("/api/v1/users/usr-ls-arjun/status", json={"status": "suspended"}, headers=csrf(client))
    assert res.status_code == 200 and res.json()["status"] == "suspended"
    assert kc_admin(client).enabled["arjun.mehta@littlesteps.example.edu"] is False
    res = client.put("/api/v1/users/usr-ls-arjun/status", json={"status": "active"}, headers=csrf(client))
    assert res.json()["status"] == "active"
    assert (
        client.put(
            "/api/v1/users/usr-ls-priya/status", json={"status": "suspended"}, headers=csrf(client)
        ).status_code
        == 409
    )


def test_sessions_revoke_and_teacher_limits(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    own = client.get("/api/v1/sessions").json()["items"]
    assert own and {s["userId"] for s in own} == {"usr-ls-arjun"}
    assert client.delete("/api/v1/sessions/ses-ls-priya-1", headers=csrf(client)).status_code == 403
    invite = {
        "legalName": "X",
        "email": "x@littlesteps.example.edu",
        "roleId": TEACHER_ROLE,
        "scope": {"kind": "campus", "targetId": "cmp-ls-main"},
    }
    assert client.post("/api/v1/users/invite", json=invite, headers=csrf(client)).status_code == 403
    revoked = client.delete(f"/api/v1/sessions/{own[0]['id']}", headers=csrf(client))
    assert revoked.status_code == 200 and revoked.json()["revokedAt"] is not None


def test_minor_details_are_masked_except_for_family_and_restricted_access(
    client: TestClient, kc: FakeKeycloak
) -> None:
    sign_in(client, kc, **SUNITA)  # guardian of Rohan and Ishaan
    people = {p["id"]: p for p in client.get("/api/v1/people").json()["items"]}
    assert set(people) == {"per-ls-sunita", "per-ls-rohan", "per-ls-ishaan"}
    assert people["per-ls-rohan"]["dateOfBirth"] is not None  # family sees it
    client.post("/api/v1/auth/logout", headers=csrf(client))
    sign_in(client, kc, **ARJUN)  # teacher: may read users, not restricted data
    rohan = next(
        p
        for p in client.get("/api/v1/people", params={"pageSize": 200}).json()["items"]
        if p["id"] == "per-ls-rohan"
    )
    assert rohan["dateOfBirth"] is None and rohan["phone"] is None
