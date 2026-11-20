"""M02 write routes (NEX-048): invite, user status, custom roles, role assignments, session revoke.

Same bodies, errors and audit actions as the mock (`handlers/m02Writes.ts`). Keycloak is called last inside
the transaction, so a Keycloak failure rolls the database change back (`503`).
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Response
from sqlalchemy import text

from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError
from nexus.core.ids import new_id
from nexus.core.permissions import CODES, Authorized, require
from nexus.modules.m02.directory import assignment_out
from nexus.modules.m02.keycloak_admin import KeycloakAdmin
from nexus.modules.m02.schemas import (
    AssignmentIn,
    InviteUserIn,
    RoleAssignmentOut,
    RoleIn,
    RoleOut,
    SessionOut,
    UserOut,
    UserStatusIn,
    assignment_issues,
    role_issues,
)
from nexus.modules.m02.service import (
    ADMIN_PERMISSION,
    assert_scope,
    audit,
    conflict,
    invalid,
    keeps_admin,
    keycloak_admin,
    not_found,
    role_out,
    session_out,
    user_out,
)

router = APIRouter(prefix="/api/v1", tags=["m02 users & access"])
Anyone = Annotated[Authorized, Depends(require(None, "M02"))]
UserManager = Annotated[Authorized, Depends(require("m02.user.invite", "M02"))]
RoleManager = Annotated[Authorized, Depends(require(ADMIN_PERMISSION, "M02"))]
Admin = Annotated[KeycloakAdmin, Depends(keycloak_admin)]
JsonBody = Annotated[Any, Body()]


async def _role(auth: Authorized, role_id: str) -> RoleOut:
    role = await role_out(auth.ctx.db, role_id)
    if role is None:
        raise not_found()
    return role


@router.post("/users/invite", status_code=201, response_model=UserOut)
async def invite(auth: UserManager, kc: Admin, body: JsonBody) -> UserOut:
    data = parse_body(InviteUserIn, body)
    db, tenant = auth.ctx.db, auth.ctx.tenant.tenant_id
    email = data.email.strip().lower()
    if (await db.execute(text("SELECT 1 FROM users WHERE lower(email) = :e"), {"e": email})).first():
        raise conflict("email", "This email already has an account")
    role = await _role(auth, data.role_id)
    await assert_scope(db, list(role.allowed_scope_kinds), data.scope)
    now = datetime.now(UTC)
    person_id, user_id = new_id("per"), new_id("usr")
    await db.execute(
        text(
            "INSERT INTO people (id, tenant_id, legal_name, is_minor, email, retention_state, created_at, "
            "updated_at) "
            "VALUES (:id, :t, :name, false, :e, 'active', :now, :now)"
        ),
        {"id": person_id, "t": tenant, "name": data.legal_name.strip(), "e": email, "now": now},
    )
    await db.execute(
        text(
            "INSERT INTO users (id, tenant_id, person_id, email, status, mfa_enabled, passkey_count, "
            "sso_only, created_at, updated_at) "
            "VALUES (:id, :t, :p, :e, 'invited', false, 0, false, :now, :now)"
        ),
        {"id": user_id, "t": tenant, "p": person_id, "e": email, "now": now},
    )
    await db.execute(
        text(
            "INSERT INTO role_assignments (id, tenant_id, user_id, role_id, scope_kind, scope_target_id, "
            "effective_from, granted_by) VALUES (:id, :t, :u, :r, :k, :target, :from_, :by)"
        ),
        {
            "id": new_id("ra"),
            "t": tenant,
            "u": user_id,
            "r": role.id,
            "k": data.scope.kind,
            "target": data.scope.target_id,
            "from_": now.date(),
            "by": auth.ctx.user_id,
        },
    )
    await audit(auth, "m02.user.invited", "user", user_id, ["email", "roleId", "scope"])
    await kc.invite(tenant_id=tenant, email=email, legal_name=data.legal_name.strip())
    user = await user_out(db, user_id)
    assert user is not None
    return user


@router.put("/users/{user_id}/status", response_model=UserOut)
async def set_status(user_id: str, auth: UserManager, kc: Admin, body: JsonBody) -> UserOut:
    user = await user_out(auth.ctx.db, user_id)
    if user is None:
        raise not_found()
    data = parse_body(UserStatusIn, body)
    if user.id == auth.ctx.user_id:
        raise conflict("status", "You cannot change your own status")
    await auth.ctx.db.execute(
        text("UPDATE users SET status = :s, updated_at = now() WHERE id = :id"),
        {"s": data.status, "id": user.id},
    )
    if data.status == "suspended":  # a suspended user is signed out everywhere
        await auth.ctx.db.execute(
            text("UPDATE sessions SET revoked_at = now() WHERE user_id = :u AND revoked_at IS NULL"),
            {"u": user.id},
        )
    action = "m02.user.reactivated" if data.status == "active" else "m02.user.suspended"
    await audit(auth, action, "user", user.id, ["status"])
    await kc.set_enabled(email=user.email, enabled=data.status == "active")
    updated = await user_out(auth.ctx.db, user.id)
    assert updated is not None
    return updated


def _check_codes(data: RoleIn) -> None:
    unknown = [c for c in data.permissions if c not in CODES]
    if unknown:
        raise invalid("permissions", f"Unknown permission: {unknown[0]}")


async def _write_permissions(auth: Authorized, role_id: str, codes: list[str]) -> None:
    await auth.ctx.db.execute(text("DELETE FROM role_permissions WHERE role_id = :r"), {"r": role_id})
    for code in codes:
        await auth.ctx.db.execute(
            text("INSERT INTO role_permissions (role_id, permission_code, tenant_id) VALUES (:r, :c, :t)"),
            {"r": role_id, "c": code, "t": auth.ctx.tenant.tenant_id},
        )


@router.post("/roles", status_code=201, response_model=RoleOut)
async def create_role(auth: RoleManager, body: JsonBody) -> RoleOut:
    data = parse_body(RoleIn, body, role_issues)
    _check_codes(data)
    role_id = new_id("rol")
    await auth.ctx.db.execute(
        text("INSERT INTO roles (id, tenant_id, name, system, allowed_scope_kinds) VALUES (:id, :t, :n, false, :k)"),
        {
            "id": role_id,
            "t": auth.ctx.tenant.tenant_id,
            "n": data.name.strip(),
            "k": list(data.allowed_scope_kinds),
        },
    )
    await _write_permissions(auth, role_id, data.permissions)
    await audit(auth, "m02.role.created", "role", role_id, ["name", "permissions"])
    return await _role(auth, role_id)


@router.put("/roles/{role_id}", response_model=RoleOut)
async def update_role(role_id: str, auth: RoleManager, body: JsonBody) -> RoleOut:
    existing = await _role(auth, role_id)
    if existing.system:
        raise conflict("", "System roles are read-only")
    data = parse_body(RoleIn, body, role_issues)
    _check_codes(data)
    await auth.ctx.db.execute(
        text("UPDATE roles SET name = :n, allowed_scope_kinds = :k, updated_at = now() WHERE id = :id"),
        {"n": data.name.strip(), "k": list(data.allowed_scope_kinds), "id": role_id},
    )
    await _write_permissions(auth, role_id, data.permissions)
    await audit(auth, "m02.role.updated", "role", role_id, ["name", "permissions", "allowedScopeKinds"])
    return await _role(auth, role_id)


@router.post("/role-assignments", status_code=201, response_model=RoleAssignmentOut)
async def assign(auth: RoleManager, body: JsonBody) -> RoleAssignmentOut:
    data = parse_body(AssignmentIn, body, assignment_issues)
    if await user_out(auth.ctx.db, data.user_id) is None:
        raise not_found()
    role = await _role(auth, data.role_id)
    await assert_scope(auth.ctx.db, list(role.allowed_scope_kinds), data.scope)
    row: dict[str, Any] = {
        "id": new_id("ra"),
        "tenant_id": auth.ctx.tenant.tenant_id,
        "user_id": data.user_id,
        "role_id": role.id,
        "scope_kind": data.scope.kind,
        "scope_target_id": data.scope.target_id,
        "academic_year_id": None,
        "effective_from": data.effective_from,
        "effective_to": data.effective_to,
        "granted_by": auth.ctx.user_id,
        "created_at": datetime.now(UTC),
    }
    await auth.ctx.db.execute(
        text(
            "INSERT INTO role_assignments (id, tenant_id, user_id, role_id, scope_kind, scope_target_id, "
            "academic_year_id, effective_from, effective_to, granted_by, created_at) VALUES (:id, "
            ":tenant_id, :user_id, :role_id, :scope_kind, :scope_target_id, :academic_year_id, "
            ":effective_from, :effective_to, :granted_by, :created_at)"
        ),
        row,
    )
    await audit(auth, "m02.role.assigned", "roleAssignment", row["id"], ["roleId", "scope"])
    return assignment_out(row)


@router.delete("/role-assignments/{assignment_id}", status_code=204)
async def unassign(assignment_id: str, auth: RoleManager) -> Response:
    row = (
        await auth.ctx.db.execute(
            text(
                "SELECT ra.user_id, EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = ra.role_id "
                "AND rp.permission_code = :p) AS admin FROM role_assignments ra WHERE ra.id = :id"
            ),
            {"id": assignment_id, "p": ADMIN_PERMISSION},
        )
    ).first()
    if row is None:
        raise not_found()
    own_last_admin = row.user_id == auth.ctx.user_id and row.admin
    if own_last_admin and not await keeps_admin(auth.ctx.db, auth.ctx.user_id, assignment_id):
        raise conflict("", "You cannot remove your own last admin role")
    await auth.ctx.db.execute(text("DELETE FROM role_assignments WHERE id = :id"), {"id": assignment_id})
    await audit(auth, "m02.role.unassigned", "roleAssignment", assignment_id, ["roleId"])
    return Response(status_code=204)


@router.delete("/sessions/{session_id}", response_model=SessionOut)
async def revoke(session_id: str, auth: Anyone) -> SessionOut:
    """Own sessions for everyone; any of the tenant's sessions with `m02.user.invite`."""
    session = await session_out(auth.ctx.db, session_id)
    if session is None:
        raise not_found()
    if session.user_id != auth.ctx.user_id and not auth.grants.has("m02.user.invite"):
        raise ApiError(403, "forbidden", "Your role does not allow this.")
    await auth.ctx.db.execute(
        text("UPDATE sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE id = :id"),
        {"id": session_id},
    )
    await audit(auth, "m02.session.revoked", "session", session_id, ["revokedAt"])
    revoked = await session_out(auth.ctx.db, session_id)
    assert revoked is not None
    return revoked
