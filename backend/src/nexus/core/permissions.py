"""Permissions (M02, V-1): the catalogue, a user's active grants, and the `require` guard every endpoint uses.

A grant is a permission held through a role assignment that is in force today (`effective_from ≤ today ≤
effective_to`, D25), in one scope (group → institution → campus → department → class, or `own`). `require`
checks the module switch first (`403 module_disabled`), then that the user holds the permission in **some**
scope (`403 forbidden`); services narrow results to the scopes with `Grants.allows` / `Grants.scopes`.
"""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.entitlements import ensure_module_enabled
from nexus.core.errors import ApiError
from nexus.core.request_context import RequestContext, authenticated

ScopeKind = Literal["group", "institution", "campus", "department", "class", "own"]


@dataclass(frozen=True)
class PermissionDef:
    code: str
    sensitive: bool
    description_key: str

    @property
    def module_id(self) -> str:
        return self.code[:3].upper()


def _p(code: str, key: str, sensitive: bool = False) -> PermissionDef:
    return PermissionDef(code, sensitive, key)


#: The Stage 1 catalogue — identical to the mocks' `PERMISSIONS` (a parity test checks code, flag and key).
CATALOGUE: tuple[PermissionDef, ...] = (
    _p("m01.institution.read", "m01.permission.institutionRead"),
    _p("m01.institution.manage", "m01.permission.institutionManage"),
    _p("m01.calendar.manage", "m01.permission.calendarManage"),
    _p("m02.user.read", "m02.permission.userRead"),
    _p("m02.user.invite", "m02.permission.userInvite"),
    _p("m02.role.manage", "m02.permission.roleManage"),
    _p("m02.person.read_restricted", "m02.permission.personReadRestricted", True),
    _p("m02.sso.manage", "m02.permission.ssoManage"),
    _p("m03.theme.manage", "m03.permission.themeManage"),
    _p("m04.text.manage", "m04.permission.textManage"),
    _p("m05.plan.read", "m05.permission.planRead"),
    _p("m05.module.manage", "m05.permission.moduleManage"),
    _p("m06.audit.read", "m06.permission.auditRead"),
    _p("m06.consent.manage", "m06.permission.consentManage"),
    _p("m06.request.manage", "m06.permission.requestManage", True),
    _p("m07.template.manage", "m07.permission.templateManage"),
    _p("m07.notification.send", "m07.permission.notificationSend"),
    _p("m07.preference.manage", "m07.permission.preferenceManage"),
    _p("m10.device.read", "m10.permission.deviceRead"),
    _p("m10.device.wipe", "m10.permission.deviceWipe"),
    _p("m11.assist.use", "m11.permission.assistUse"),
    _p("m11.settings.manage", "m11.permission.settingsManage"),
    _p("m83.vault.read", "m83.permission.vaultRead"),
    _p("m83.grant.approve", "m83.permission.grantApprove", True),
)
CODES = frozenset(p.code for p in CATALOGUE)


@dataclass(frozen=True)
class Scope:
    kind: ScopeKind
    target_id: str | None


@dataclass(frozen=True)
class Resource:
    """Where a record sits; fields left None are unknown/not applicable."""

    group_id: str | None = None
    institution_id: str | None = None
    campus_id: str | None = None
    department_id: str | None = None
    class_id: str | None = None
    #: The user the record belongs to (for `own` scope).
    owner_user_id: str | None = None


@dataclass(frozen=True)
class Grants:
    user_id: str
    by_permission: dict[str, tuple[Scope, ...]] = field(default_factory=dict)

    @property
    def permissions(self) -> list[str]:
        return sorted(self.by_permission)

    def has(self, permission: str) -> bool:
        return permission in self.by_permission

    def scopes(self, permission: str) -> tuple[Scope, ...]:
        return self.by_permission.get(permission, ())

    def allows(self, permission: str, resource: Resource) -> bool:
        """True when one of the user's scopes for `permission` contains `resource`."""
        for s in self.scopes(permission):
            target = {
                "group": resource.group_id,
                "institution": resource.institution_id,
                "campus": resource.campus_id,
                "department": resource.department_id,
                "class": resource.class_id,
            }.get(s.kind)
            if s.kind == "own" and resource.owner_user_id == self.user_id:
                return True
            if s.kind != "own" and target is not None and target == s.target_id:
                return True
        return False


async def load_grants(db: AsyncSession, user_id: str, today: date | None = None) -> Grants:
    """Permissions of the user's assignments in force on `today`, with their scopes (RLS: own tenant)."""
    rows = (
        await db.execute(
            text(
                "SELECT rp.permission_code, ra.scope_kind, ra.scope_target_id FROM role_assignments ra "
                "JOIN role_permissions rp ON rp.role_id = ra.role_id AND rp.tenant_id = ra.tenant_id "
                "WHERE ra.user_id = :u AND ra.effective_from <= :d "
                "AND (ra.effective_to IS NULL OR ra.effective_to >= :d)"
            ),
            {"u": user_id, "d": today or date.today()},
        )
    ).all()
    collected: dict[str, list[Scope]] = {}
    for code, kind, target in rows:
        scopes = collected.setdefault(code, [])
        scope = Scope(kind, target)
        if scope not in scopes:
            scopes.append(scope)
    return Grants(user_id=user_id, by_permission={k: tuple(v) for k, v in collected.items()})


@dataclass(frozen=True)
class Authorized:
    """What a guarded endpoint receives: the request context plus the caller's grants."""

    ctx: RequestContext
    grants: Grants


def require(permission: str | None, module: str) -> Callable[..., AsyncIterator[Authorized]]:
    """Guard for an endpoint of `module`; `permission=None` = any signed-in user of an entitled tenant."""
    if permission is not None and permission not in CODES:
        raise ValueError(f"unknown permission {permission!r}")
    if permission is not None and not permission.startswith(module.lower() + "."):
        raise ValueError(f"permission {permission!r} is not in module {module}")

    async def guard(ctx: Annotated[RequestContext, Depends(authenticated)]) -> AsyncIterator[Authorized]:
        await ensure_module_enabled(ctx.db, ctx.tenant.tenant_id, module)
        grants = await load_grants(ctx.db, ctx.user_id)
        if permission is not None and not grants.has(permission):
            raise ApiError(403, "forbidden", "Your role does not allow this.")
        yield Authorized(ctx=ctx, grants=grants)

    guard.__nexus_guard__ = (permission, module)  # type: ignore[attr-defined]
    return guard


def guard_of(dependency: Any) -> tuple[str | None, str] | None:
    """The `(permission, module)` a dependency enforces, if it is a `require` guard (route-walk test)."""
    value = getattr(dependency, "__nexus_guard__", None)
    return value if isinstance(value, tuple) else None
