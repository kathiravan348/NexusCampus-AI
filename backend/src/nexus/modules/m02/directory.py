"""M02 read routes (NEX-048): people (masked), users, roles, permissions, role assignments, sessions."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import CATALOGUE, Authorized, require
from nexus.modules.m02.schemas import (
    PermissionOut,
    PersonOut,
    RoleAssignmentOut,
    RoleOut,
    ScopeOut,
    SessionOut,
    UserOut,
)
from nexus.modules.m02.service import (
    PEOPLE_SELECT,
    SESSIONS_SELECT,
    USERS_SELECT,
    family_of,
    mask,
    role_out,
)

router = APIRouter(prefix="/api/v1", tags=["m02 users & access"])
Paging = Annotated[PageQuery, Depends(page_query)]
Anyone = Annotated[Authorized, Depends(require(None, "M02"))]
UserReader = Annotated[Authorized, Depends(require("m02.user.read", "M02"))]
RoleManager = Annotated[Authorized, Depends(require("m02.role.manage", "M02"))]


async def _page(
    db: AsyncSession, sql: str, where: str, params: dict[str, Any], page: PageQuery
) -> tuple[list[Any], int]:
    total = (await db.execute(text(f"SELECT count(*) FROM ({sql} {where}) t"), params)).scalar_one()  # noqa: S608
    rows = (
        (
            await db.execute(
                text(f"{sql} {where} ORDER BY created_at, id LIMIT :limit OFFSET :offset"),
                {**params, "limit": page.page_size, "offset": page.offset},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows], int(total)


@router.get("/people", response_model=Page[PersonOut])
async def people(auth: Anyone, page: Paging) -> Page[PersonOut]:
    """Everyone may list people; without `m02.user.read` only themselves and their linked learners."""
    db = auth.ctx.db
    family = await family_of(db, auth.ctx.person_id)
    sql = PEOPLE_SELECT
    if auth.grants.has("m02.user.read"):
        rows, total = await _page(db, sql, "", {}, page)
    else:
        rows, total = await _page(db, sql, "WHERE id = ANY(:ids)", {"ids": sorted(family)}, page)
    return Page.of([mask(r, auth, family) for r in rows], total, page)


@router.get("/users", response_model=Page[UserOut])
async def users(auth: UserReader, page: Paging) -> Page[UserOut]:
    rows, total = await _page(auth.ctx.db, USERS_SELECT, "", {}, page)
    return Page.of([UserOut.model_validate(r) for r in rows], total, page)


@router.get("/roles", response_model=Page[RoleOut])
async def roles(auth: RoleManager, page: Paging) -> Page[RoleOut]:
    rows, total = await _page(auth.ctx.db, "SELECT id, created_at FROM roles", "", {}, page)
    out = [await role_out(auth.ctx.db, r["id"]) for r in rows]
    return Page.of([r for r in out if r is not None], total, page)


@router.get("/permissions", response_model=Page[PermissionOut])
async def permissions(auth: RoleManager, page: Paging) -> Page[PermissionOut]:
    items = [
        PermissionOut(
            code=p.code, module_id=p.module_id, sensitive=p.sensitive, description_key=p.description_key
        )
        for p in CATALOGUE
    ]
    return Page.of(items[page.offset : page.offset + page.page_size], len(items), page)


@router.get("/role-assignments", response_model=Page[RoleAssignmentOut])
async def role_assignments(auth: RoleManager, page: Paging) -> Page[RoleAssignmentOut]:
    sql = (
        "SELECT id, tenant_id, user_id, role_id, scope_kind, scope_target_id, academic_year_id, "
        "effective_from, effective_to, granted_by, created_at FROM role_assignments"
    )
    rows, total = await _page(auth.ctx.db, sql, "", {}, page)
    return Page.of([assignment_out(r) for r in rows], total, page)


def assignment_out(row: dict[str, Any]) -> RoleAssignmentOut:
    return RoleAssignmentOut(
        scope=ScopeOut(kind=row["scope_kind"], target_id=row["scope_target_id"]),
        **{k: v for k, v in row.items() if not k.startswith("scope_")},
    )


@router.get("/sessions", response_model=Page[SessionOut])
async def sessions(auth: Anyone, page: Paging) -> Page[SessionOut]:
    """All of the tenant's sessions with `m02.user.invite`, else the caller's own."""
    sql = SESSIONS_SELECT
    if auth.grants.has("m02.user.invite"):
        rows, total = await _page(auth.ctx.db, sql, "", {}, page)
    else:
        rows, total = await _page(auth.ctx.db, sql, "WHERE user_id = :u", {"u": auth.ctx.user_id}, page)
    return Page.of([SessionOut.model_validate(r) for r in rows], total, page)
