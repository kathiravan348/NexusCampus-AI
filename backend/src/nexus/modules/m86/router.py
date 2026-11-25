"""Guarded M86 rollover endpoints (reads and the D84 write flow; order and errors as the NEX-208 mock)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m17.service import active_staff
from nexus.modules.m86.models import PromotionDecision, RolloverRun
from nexus.modules.m86.schemas import PromotionDecisionIn, PromotionDecisionOut, RolloverRunIn, RolloverRunOut
from nexus.modules.m86.service import confirm, create_run, decision_out, override, rollback, run_of, run_out

router = APIRouter(prefix="/api/v1", tags=["m86 rollover"])
Reader = Annotated[Authorized, Depends(require("m86.rollover.read", "M86"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m86.rollover.manage", "M86"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]


def _body(schema: type[RolloverRunIn] | type[PromotionDecisionIn]) -> dict[str, object]:
    return {"requestBody": {"required": True, "content": {"application/json": {"schema": schema.model_json_schema()}}}}


@router.get("/rollover-runs")
async def rollover_runs(auth: Reader, page: Paging) -> Page[RolloverRunOut]:
    db = auth.ctx.db
    rows = (await db.scalars(select(RolloverRun).order_by(RolloverRun.list_order, RolloverRun.id))).all()
    window = rows[page.offset : page.offset + page.page_size]
    return Page.of([run_out(row) for row in window], len(rows), page)


@router.get("/rollover-runs/{run_id}/decisions")
async def decisions(run_id: str, auth: Reader, page: Paging) -> Page[PromotionDecisionOut]:
    run = await run_of(auth, run_id)
    query = (
        select(PromotionDecision)
        .where(PromotionDecision.run_id == run.id)
        .order_by(PromotionDecision.list_order, PromotionDecision.id)
    )
    rows = (await auth.ctx.db.scalars(query)).all()
    window = rows[page.offset : page.offset + page.page_size]
    return Page.of([decision_out(row) for row in window], len(rows), page)


@router.post("/rollover-runs", status_code=201, openapi_extra=_body(RolloverRunIn))
async def post_run(auth: Manager, request: Request) -> RolloverRunOut:
    # Module → permission (guard) → active staff profile → body → references → one open run.
    staff = await active_staff(auth)
    return await create_run(auth, staff, await request.body())


@router.put("/rollover-runs/{run_id}/decisions/{decision_id}", openapi_extra=_body(PromotionDecisionIn))
async def put_decision(run_id: str, decision_id: str, auth: Manager, request: Request) -> PromotionDecisionOut:
    staff = await active_staff(auth)
    return await override(auth, staff, run_id, decision_id, await request.body())


@router.post("/rollover-runs/{run_id}/confirm")
async def post_confirm(run_id: str, auth: Manager) -> RolloverRunOut:
    await active_staff(auth)
    return await confirm(auth, run_id)


@router.post("/rollover-runs/{run_id}/rollback")
async def post_rollback(run_id: str, auth: Manager) -> RolloverRunOut:
    await active_staff(auth)
    return await rollback(auth, run_id)
