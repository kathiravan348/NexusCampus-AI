"""M02 rules shared by the read and write routes, equal to the mock (`handlers/m02Store.ts`, `context.ts`)."""

from typing import Any

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.permissions import Authorized
from nexus.modules.m02.keycloak_admin import KeycloakAdmin
from nexus.modules.m02.schemas import PersonOut, RoleOut, ScopeIn, SessionOut, UserOut

READ_RESTRICTED = "m02.person.read_restricted"
#: Admin-capable = may manage roles; nobody may drop their own last one (mock `ADMIN_PERMISSION`).
ADMIN_PERMISSION = "m02.role.manage"

PEOPLE_SELECT = (
    "SELECT id, tenant_id, legal_name, preferred_name, date_of_birth, is_minor, email, phone, "
    "preferred_locale, retention_state, created_at, updated_at FROM people"
)
USERS_SELECT = (
    "SELECT id, tenant_id, person_id, email, status, mfa_enabled, passkey_count, sso_only, last_sign_in_at, "
    "created_at, updated_at FROM users"
)
USER_BY_ID = (
    "SELECT id, tenant_id, person_id, email, status, mfa_enabled, passkey_count, sso_only, last_sign_in_at, "
    "created_at, updated_at FROM users WHERE id = :id"
)
SESSION_BY_ID = (
    "SELECT id, tenant_id, user_id, device_id, device_label, auth_method, mfa_verified, ip_address, "
    "created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE id = :id"
)
EXISTS_BY_ID = {
    "groups": "SELECT 1 FROM groups WHERE id = :id",
    "institutions": "SELECT 1 FROM institutions WHERE id = :id",
    "campuses": "SELECT 1 FROM campuses WHERE id = :id",
}
SESSIONS_SELECT = (
    "SELECT id, tenant_id, user_id, device_id, device_label, auth_method, mfa_verified, ip_address, "
    "created_at, last_seen_at, expires_at, revoked_at FROM sessions"
)


def keycloak_admin(request: Request) -> KeycloakAdmin:
    admin: KeycloakAdmin = request.app.state.keycloak_admin
    return admin


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def invalid(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


def conflict(path: str, message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path=path, message=message)])


async def family_of(db: AsyncSession, person_id: str) -> set[str]:
    """The viewer and the learners they are guardian of."""
    rows = await db.execute(
        text("SELECT learner_person_id FROM guardian_links WHERE guardian_person_id = :p"), {"p": person_id}
    )
    return {person_id, *rows.scalars()}


def mask(person: dict[str, Any], auth: Authorized, family: set[str]) -> PersonOut:
    """G-6: a minor's date of birth, phone and email are hidden unless restricted access or family."""
    if person["is_minor"] and not (auth.grants.has(READ_RESTRICTED) or person["id"] in family):
        person = {**person, "date_of_birth": None, "phone": None, "email": None}
    return PersonOut.model_validate(person)


async def role_out(db: AsyncSession, role_id: str) -> RoleOut | None:
    row = (
        (
            await db.execute(
                text(
                    "SELECT id, tenant_id, name, system, allowed_scope_kinds, created_at, updated_at "
                    "FROM roles "
                    "WHERE id = :id"
                ),
                {"id": role_id},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return None
    perms = await db.execute(
        text("SELECT permission_code FROM role_permissions WHERE role_id = :id ORDER BY permission_code"),
        {"id": role_id},
    )
    return RoleOut.model_validate({**row, "permissions": list(perms.scalars())})


async def user_out(db: AsyncSession, user_id: str) -> UserOut | None:
    row = (await db.execute(text(USER_BY_ID), {"id": user_id})).mappings().first()
    return UserOut.model_validate(dict(row)) if row else None


async def session_out(db: AsyncSession, session_id: str) -> SessionOut | None:
    row = (await db.execute(text(SESSION_BY_ID), {"id": session_id})).mappings().first()
    return SessionOut.model_validate(dict(row)) if row else None


async def assert_scope(db: AsyncSession, allowed: list[str], scope: ScopeIn) -> None:
    """The scope kind must be allowed by the role and its target must exist in this tenant (RLS)."""
    if scope.kind not in allowed:
        raise invalid("scope.kind", f"This role cannot be given in a {scope.kind} scope")
    table = {"group": "groups", "institution": "institutions", "campus": "campuses"}.get(scope.kind)
    if table is not None:
        exists = (await db.execute(text(EXISTS_BY_ID[table]), {"id": scope.target_id})).first()
        if not exists:
            raise invalid("scope.targetId", "Unknown scope target")


async def keeps_admin(db: AsyncSession, user_id: str, except_assignment_id: str) -> bool:
    row = (
        await db.execute(
            text(
                "SELECT 1 FROM role_assignments ra JOIN role_permissions rp ON rp.role_id = ra.role_id "
                "WHERE ra.user_id = :u AND ra.id <> :a AND rp.permission_code = :p LIMIT 1"
            ),
            {"u": user_id, "a": except_assignment_id, "p": ADMIN_PERMISSION},
        )
    ).first()
    return row is not None


async def audit(auth: Authorized, action: str, target_type: str, target_id: str, fields: list[str]) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes(*fields),
        ),
    )
