"""M02 response models — strict, camelCase JSON exactly as `contracts/src/user.ts` and `person.ts`."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_serializer
from pydantic.alias_generators import to_camel

from nexus.core.hashchain import format_instant


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True, frozen=True)

    @field_serializer("*", when_used="json")
    def _instants(self, value: Any) -> Any:
        # Contract `UtcDateTime`: `2026-05-04T06:00:00Z` (same text as the mocks and the audit hash).
        if isinstance(value, datetime):
            return format_instant(value)
        if isinstance(value, date):
            return value.isoformat()
        return value


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
