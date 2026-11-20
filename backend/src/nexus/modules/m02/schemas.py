"""M02 response models — strict, camelCase JSON exactly as `contracts/src/user.ts` and `person.ts`."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, model_validator

from nexus.core.schemas import Contract


class UserOut(Contract):
    id: str
    tenant_id: str
    person_id: str
    email: str
    status: Literal["invited", "active", "suspended", "locked"]
    mfa_enabled: bool
    passkey_count: int
    sso_only: bool
    last_sign_in_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PersonOut(Contract):
    id: str
    tenant_id: str
    legal_name: str
    preferred_name: str | None
    date_of_birth: date | None
    is_minor: bool
    email: str | None
    phone: str | None
    preferred_locale: str | None
    retention_state: Literal["active", "archived", "crypto_shredded"]
    created_at: datetime
    updated_at: datetime


class RoleProfileOut(Contract):
    id: str
    tenant_id: str
    person_id: str
    institution_id: str
    campus_id: str | None
    kind: Literal["staff", "guardian", "learner", "alumni", "external"]
    academic_year_id: str | None
    effective_from: date
    effective_to: date | None
    status: Literal["active", "inactive", "suspended"]
    created_at: datetime
    updated_at: datetime


class ScopeOut(Contract):
    kind: Literal["group", "institution", "campus", "department", "class", "own"]
    target_id: str | None


class RoleAssignmentOut(Contract):
    id: str
    tenant_id: str
    user_id: str
    role_id: str
    scope: ScopeOut
    academic_year_id: str | None
    effective_from: date
    effective_to: date | None
    granted_by: str
    created_at: datetime


class MeOut(Contract):
    """`GET /api/v1/me`: permissions = those in force today (union over the user's assignments)."""

    user: UserOut
    person: PersonOut
    role_profiles: list[RoleProfileOut]
    assignments: list[RoleAssignmentOut]
    permissions: list[str]


class SessionOut(Contract):
    id: str
    tenant_id: str
    user_id: str
    device_id: str
    device_label: str
    auth_method: Literal["password", "sso", "passkey"]
    mfa_verified: bool
    ip_address: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class PermissionOut(Contract):
    code: str
    module_id: str
    sensitive: bool
    description_key: str


ScopeKind = Literal["group", "institution", "campus", "department", "class", "own"]


class RoleOut(Contract):
    id: str
    tenant_id: str
    name: str
    system: bool
    permissions: list[str]
    allowed_scope_kinds: list[ScopeKind]
    created_at: datetime
    updated_at: datetime


class ScopeIn(Contract):
    kind: ScopeKind
    target_id: str | None = Field(min_length=1, max_length=128)

    @model_validator(mode="after")
    def _target_iff_not_own(self) -> "ScopeIn":
        if (self.target_id is None) != (self.kind == "own"):
            raise ValueError("targetId must be null for own scope and set for every other scope")
        return self


class InviteUserIn(Contract):
    legal_name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role_id: str = Field(min_length=1, max_length=128)
    scope: ScopeIn


class UserStatusIn(Contract):
    status: Literal["active", "suspended"]


class RoleIn(Contract):
    name: str = Field(min_length=1, max_length=200)
    permissions: list[str] = Field(min_length=1)
    allowed_scope_kinds: list[ScopeKind] = Field(min_length=1)


class AssignmentIn(Contract):
    user_id: str = Field(min_length=1, max_length=128)
    role_id: str = Field(min_length=1, max_length=128)
    scope: ScopeIn
    effective_from: date
    effective_to: date | None


def role_issues(raw: dict[str, Any]) -> list[tuple[str, str]]:
    issues: list[tuple[str, str]] = []
    for key in ("permissions", "allowedScopeKinds"):
        values = raw.get(key)
        if isinstance(values, list) and len(set(map(str, values))) != len(values):
            issues.append((key, f"{key} has duplicates"))
    return issues


def assignment_issues(raw: dict[str, Any]) -> list[tuple[str, str]]:
    start, end = raw.get("effectiveFrom"), raw.get("effectiveTo")
    if isinstance(start, str) and isinstance(end, str) and end < start:
        return [("effectiveTo", "effectiveTo is before effectiveFrom")]
    return []
