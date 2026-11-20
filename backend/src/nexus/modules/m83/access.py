"""M83 provider access (NEX-051, V-3/V-5): access requests (approve / deny), grants (revoke), break-glass notices.

Same bodies, errors and audit actions as the mock (`handlers/m83.ts`). Approval can only narrow what was asked
(modules, read instead of edit, fewer hours); the approved grant starts now and ends at most 72 h later. An
approved request whose grant ran out reads as `expired`; revoking a grant makes its request `revoked`.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends
from pydantic import Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.schemas import Contract

router = APIRouter(prefix="/api/v1", tags=["m83 data vault"])
#: Vault and provider-access records are for the institution's own admins only (D22).
Reader = Annotated[Authorized, Depends(require("m83.vault.read", "M83"))]
Decider = Annotated[Authorized, Depends(require("m83.grant.approve", "M83"))]
JsonBody = Annotated[Any, Body()]

MAX_GRANT_HOURS = 72
ModuleId = Annotated[str, StringConstraints(pattern=r"^[MP](0[1-9]|[1-9]\d)$")]
Mode = Literal["read", "edit"]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

_REQUEST = (
    "SELECT r.id, r.tenant_id, r.staff_ref, r.staff_display_name, r.reason, r.modules, r.mode, r.duration_hours, "
    "CASE WHEN r.status = 'approved' AND g.revoked_at IS NULL AND g.ends_at <= now() THEN 'expired' "
    "ELSE r.status END AS status, r.requested_at, r.decided_at, r.decided_by "
    "FROM access_requests r LEFT JOIN access_grants g ON g.request_id = r.id"
)
_GRANT = "SELECT id, tenant_id, request_id, modules, mode, starts_at, ends_at, revoked_at FROM access_grants"
_NOTICE = "SELECT id, tenant_id, category, approver_refs, occurred_at, notified_at, report_url FROM break_glass_notices"


class AccessRequestOut(Contract):
    id: str
    tenant_id: str
    staff_ref: str
    staff_display_name: str
    reason: str
    modules: list[str]
    mode: Mode
    duration_hours: int
    status: Literal["pending", "approved", "denied", "expired", "revoked"]
    requested_at: datetime
    decided_at: datetime | None
    decided_by: str | None


class AccessGrantOut(Contract):
    id: str
    tenant_id: str
    request_id: str
    modules: list[str]
    mode: Mode
    starts_at: datetime
    ends_at: datetime
    revoked_at: datetime | None


class BreakGlassNoticeOut(Contract):
    id: str
    tenant_id: str
    category: Literal["legal_order", "security_incident"]
    approver_refs: tuple[str, str]
    occurred_at: datetime
    notified_at: datetime
    report_url: str | None


class ApproveIn(Contract):
    modules: list[ModuleId] = Field(min_length=1)
    mode: Mode
    duration_hours: int = Field(ge=1, le=MAX_GRANT_HOURS)


class DenyIn(Contract):
    reason: Text


class ApproveOut(Contract):
    request: AccessRequestOut
    grant: AccessGrantOut


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def _conflict(message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path="status", message=message)])


async def request_out(db: AsyncSession, request_id: str) -> AccessRequestOut | None:
    row = (await db.execute(text(_REQUEST + " WHERE r.id = :id"), {"id": request_id})).mappings().first()
    return AccessRequestOut.model_validate(dict(row)) if row else None


async def grant_out(db: AsyncSession, grant_id: str) -> AccessGrantOut | None:
    row = (await db.execute(text(_GRANT + " WHERE id = :id"), {"id": grant_id})).mappings().first()
    return AccessGrantOut.model_validate(dict(row)) if row else None


async def _page[M: Contract](
    db: AsyncSession, model: type[M], select: str, table: str, order: str, page: PageQuery
) -> Page[M]:
    total = (await db.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()  # noqa: S608
    rows = (
        (
            await db.execute(
                text(f"{select} ORDER BY {order} LIMIT :n OFFSET :o"), {"n": page.page_size, "o": page.offset}
            )
        )
        .mappings()
        .all()
    )
    return Page.of([model.model_validate(dict(r)) for r in rows], int(total), page)


async def _audit(auth: Authorized, action: str, target_type: str, target_id: str, fields: list[str]) -> None:
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


@router.get("/access-requests", response_model=Page[AccessRequestOut])
async def list_requests(auth: Reader, page: Annotated[PageQuery, Depends(page_query)]) -> Page[AccessRequestOut]:
    return await _page(auth.ctx.db, AccessRequestOut, _REQUEST, "access_requests", "r.requested_at DESC, r.id", page)


@router.get("/access-grants", response_model=Page[AccessGrantOut])
async def list_grants(auth: Reader, page: Annotated[PageQuery, Depends(page_query)]) -> Page[AccessGrantOut]:
    return await _page(auth.ctx.db, AccessGrantOut, _GRANT, "access_grants", "starts_at DESC, id", page)


@router.get("/break-glass-notices", response_model=Page[BreakGlassNoticeOut])
async def list_notices(auth: Reader, page: Annotated[PageQuery, Depends(page_query)]) -> Page[BreakGlassNoticeOut]:
    return await _page(auth.ctx.db, BreakGlassNoticeOut, _NOTICE, "break_glass_notices", "occurred_at DESC, id", page)


async def _pending(db: AsyncSession, request_id: str) -> AccessRequestOut:
    await db.execute(text("SELECT 1 FROM access_requests WHERE id = :id FOR UPDATE"), {"id": request_id})
    request = await request_out(db, request_id)
    if request is None:
        raise _not_found()
    if request.status != "pending":
        raise _conflict(f"Request is {request.status}")
    return request


def _widened(request: AccessRequestOut, data: ApproveIn) -> list[ApiErrorDetail]:
    issues = [
        ApiErrorDetail(path="modules", message=f"{m} was not requested")
        for m in data.modules
        if m not in request.modules
    ]
    if data.mode == "edit" and request.mode == "read":
        issues.append(ApiErrorDetail(path="mode", message="Edit was not requested"))
    if data.duration_hours > request.duration_hours:
        issues.append(ApiErrorDetail(path="durationHours", message="Longer than requested"))
    return issues


@router.post("/access-requests/{request_id}/approve", response_model=ApproveOut)
async def approve(request_id: str, auth: Decider, body: JsonBody) -> ApproveOut:
    db = auth.ctx.db
    request = await _pending(db, request_id)
    data = parse_body(ApproveIn, body)
    widened = _widened(request, data)
    if widened:
        raise ApiError(400, "invalid_request", "The request is not valid.", widened)
    now = datetime.now(UTC)
    await db.execute(
        text("UPDATE access_requests SET status = 'approved', decided_at = :now, decided_by = :by WHERE id = :id"),
        {"now": now, "by": auth.ctx.user_id, "id": request.id},
    )
    grant_id = new_id("acg")
    await db.execute(
        text(
            "INSERT INTO access_grants (id, tenant_id, request_id, modules, mode, starts_at, ends_at) "
            "VALUES (:id, :t, :r, :m, :mode, :s, :e)"
        ),
        {
            "id": grant_id,
            "t": auth.ctx.tenant.tenant_id,
            "r": request.id,
            "m": list(dict.fromkeys(data.modules)),
            "mode": data.mode,
            "s": now,
            "e": now + timedelta(hours=data.duration_hours),
        },
    )
    await _audit(
        auth, "m83.accessRequest.approved", "accessRequest", request.id, ["status", "modules", "mode", "durationHours"]
    )
    approved, grant = await request_out(db, request.id), await grant_out(db, grant_id)
    assert approved is not None and grant is not None
    return ApproveOut(request=approved, grant=grant)


@router.post("/access-requests/{request_id}/deny", response_model=AccessRequestOut)
async def deny(request_id: str, auth: Decider, body: JsonBody) -> AccessRequestOut:
    db = auth.ctx.db
    request = await _pending(db, request_id)
    parse_body(DenyIn, body)  # required, like the mock; the text itself is not stored (only audited by name)
    await db.execute(
        text("UPDATE access_requests SET status = 'denied', decided_at = now(), decided_by = :by WHERE id = :id"),
        {"by": auth.ctx.user_id, "id": request.id},
    )
    await _audit(auth, "m83.accessRequest.denied", "accessRequest", request.id, ["status", "denialReason"])
    denied = await request_out(db, request.id)
    assert denied is not None
    return denied


@router.post("/access-grants/{grant_id}/revoke", response_model=AccessGrantOut)
async def revoke(grant_id: str, auth: Decider) -> AccessGrantOut:
    """Ends an active grant now; its request becomes `revoked`. Ended or revoked grants → 409."""
    db = auth.ctx.db
    await db.execute(text("SELECT 1 FROM access_grants WHERE id = :id FOR UPDATE"), {"id": grant_id})
    grant = await grant_out(db, grant_id)
    if grant is None:
        raise _not_found()
    now = datetime.now(UTC)
    if grant.revoked_at is not None or grant.ends_at <= now:
        raise _conflict("Grant is no longer active")
    await db.execute(text("UPDATE access_grants SET revoked_at = :now WHERE id = :id"), {"now": now, "id": grant.id})
    await db.execute(text("UPDATE access_requests SET status = 'revoked' WHERE id = :id"), {"id": grant.request_id})
    await _audit(auth, "m83.accessGrant.revoked", "accessGrant", grant.id, ["revokedAt"])
    revoked = await grant_out(db, grant.id)
    assert revoked is not None
    return revoked
