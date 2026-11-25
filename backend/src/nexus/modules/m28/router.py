"""Guarded M25-M28 home and KPI endpoints (counts and aggregates only; rules as `m28.ts`)."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from nexus.core.permissions import Authorized, require
from nexus.modules.m28.schemas import KpiOut, RoleHomeOut
from nexus.modules.m28.service import DASHBOARDS_READ, dashboard_kpis, role_home

router = APIRouter(prefix="/api/v1", tags=["m28 homes and dashboards"])
Member = Annotated[Authorized, Depends(require(None, "M28"), scope="function")]
Leader = Annotated[Authorized, Depends(require(DASHBOARDS_READ, "M28"), scope="function")]


@router.get("/me/home")
async def me_home(auth: Member) -> RoleHomeOut:
    return await role_home(auth)


@router.get("/dashboards/kpis")
async def kpis(auth: Leader) -> list[KpiOut]:
    return await dashboard_kpis(auth, datetime.now(UTC))
