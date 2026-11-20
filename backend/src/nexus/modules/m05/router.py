"""M05 Plan & usage API (NEX-055): the tenant's plan, module switches and usage meters.

Same responses, errors and audit actions as the mock (`handlers/m05.ts`). Switching a module off takes effect on
the next request: every guard reads `entitlements` (`core/entitlements.py`), there is no cache to invalidate.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends
from sqlalchemy import text

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.schemas import Contract
from nexus.modules.m05.usage import UsageMeterOut, read_meters

router = APIRouter(prefix="/api/v1", tags=["m05 plan & usage"])
PlanReader = Annotated[Authorized, Depends(require("m05.plan.read", "M05"), scope="function")]
Anyone = Annotated[Authorized, Depends(require(None, "M05"), scope="function")]
ModuleManager = Annotated[Authorized, Depends(require("m05.module.manage", "M05"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
_PLAN = (
    "SELECT p.id, p.code, p.name_key, p.modules, p.ai_credits_per_month, p.learner_limit "
    "FROM tenant_plans tp JOIN plans p ON p.id = tp.plan_id"
)
_ENTITLEMENT = "SELECT tenant_id, module_id, enabled, source, expires_at FROM entitlements"


class PlanOut(Contract):
    id: str
    code: str
    name_key: str
    modules: list[str]
    ai_credits_per_month: int
    learner_limit: int | None


class EntitlementOut(Contract):
    tenant_id: str
    module_id: str
    enabled: bool
    source: Literal["core", "plan", "addon", "trial"]
    expires_at: datetime | None


class SetModuleIn(Contract):
    enabled: bool


@router.get("/plan", response_model=PlanOut)
async def plan(auth: PlanReader) -> PlanOut:
    row = (await auth.ctx.db.execute(text(_PLAN))).mappings().first()
    if row is None:
        raise ApiError(404, "not_found", "Not found.")
    return PlanOut.model_validate(dict(row))


@router.get("/entitlements", response_model=Page[EntitlementOut])
async def entitlements(auth: Anyone, page: Paging) -> Page[EntitlementOut]:
    """Every user: the app shell builds its menu from these."""
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM entitlements"))).scalar_one()
    rows = await db.execute(
        text(_ENTITLEMENT + " ORDER BY module_id LIMIT :n OFFSET :o"), {"n": page.page_size, "o": page.offset}
    )
    return Page.of([EntitlementOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.get("/usage", response_model=Page[UsageMeterOut])
async def usage(auth: PlanReader, page: Paging) -> Page[UsageMeterOut]:
    current = await plan(auth)
    meters = await read_meters(
        auth.ctx.db, auth.ctx.tenant.tenant_id, current.learner_limit, current.ai_credits_per_month
    )
    return Page.of(meters[page.offset : page.offset + page.page_size], len(meters), page)


@router.patch("/entitlements/{module_id}", response_model=EntitlementOut)
async def switch_module(module_id: str, auth: ModuleManager, body: Annotated[Any, Body()]) -> EntitlementOut:
    """Switch an optional module (ideology §2.2: off = hidden, never broken). Core → 409; not in plan → 403."""
    enabled = parse_body(SetModuleIn, body).enabled
    db = auth.ctx.db
    row = (
        (await db.execute(text(_ENTITLEMENT + " WHERE module_id = :m FOR UPDATE"), {"m": module_id})).mappings().first()
    )
    if row is None:
        raise ApiError(403, "module_disabled", "This module is not in your institution's plan.")
    if row["source"] == "core":
        message = "Core modules are always on"
        raise ApiError(409, "conflict", message, [ApiErrorDetail(path="enabled", message=message)])
    await db.execute(text("UPDATE entitlements SET enabled = :e WHERE module_id = :m"), {"e": enabled, "m": module_id})
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action=f"m05.module.{'enabled' if enabled else 'disabled'}",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="entitlement",
            target_id=module_id,
            changes=changes("enabled"),
        ),
    )
    return EntitlementOut.model_validate({**dict(row), "enabled": enabled})
