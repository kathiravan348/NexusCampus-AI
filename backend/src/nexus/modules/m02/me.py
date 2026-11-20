"""`GET /api/v1/me`: the signed-in user, their person and role profiles (`docs/guides/API.md`, M02)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text

from nexus.core.errors import ApiError
from nexus.core.request_context import RequestContext, authenticated
from nexus.modules.m02.schemas import MeOut, PersonOut, RoleProfileOut, UserOut

router = APIRouter(prefix="/api/v1", tags=["m02 users & access"])

_USER = (
    "SELECT id, tenant_id, person_id, email, status, mfa_enabled, passkey_count, sso_only, "
    "last_sign_in_at, created_at, updated_at FROM users WHERE id = :id"
)
_PERSON = (
    "SELECT id, tenant_id, legal_name, preferred_name, date_of_birth, is_minor, email, phone, "
    "preferred_locale, retention_state, created_at, updated_at FROM people WHERE id = :id"
)
_PROFILES = (
    "SELECT id, tenant_id, person_id, institution_id, campus_id, kind, academic_year_id, effective_from, "
    "effective_to, status, created_at, updated_at FROM role_profiles WHERE person_id = :id ORDER BY id"
)


@router.get("/me", response_model=MeOut, response_model_by_alias=True)
async def me(ctx: Annotated[RequestContext, Depends(authenticated)]) -> MeOut:
    user = (await ctx.db.execute(text(_USER), {"id": ctx.user_id})).mappings().one_or_none()
    person = (await ctx.db.execute(text(_PERSON), {"id": ctx.person_id})).mappings().one_or_none()
    if user is None or person is None:
        raise ApiError(401, "unauthorized", "Please sign in again.")
    profiles = (await ctx.db.execute(text(_PROFILES), {"id": ctx.person_id})).mappings().all()
    return MeOut(
        user=UserOut.model_validate(dict(user)),
        person=PersonOut.model_validate(dict(person)),
        role_profiles=[RoleProfileOut.model_validate(dict(p)) for p in profiles],
        assignments=[],
        permissions=[],
    )
