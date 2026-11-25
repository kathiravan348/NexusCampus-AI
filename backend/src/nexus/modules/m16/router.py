"""Guarded M16 timetable endpoints (order, errors and visibility as `m16.ts`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m15.service import read_page
from nexus.modules.m16.models import BellSchedule, Room
from nexus.modules.m16.schemas import BellScheduleOut, RoomOut, TeacherLoadOut, TimetableSlotIn, TimetableSlotOut
from nexus.modules.m16.service import create_slot, parse_slot, slot_page, teacher_loads

router = APIRouter(prefix="/api/v1", tags=["m16 timetable"])
Reader = Annotated[Authorized, Depends(require("m16.timetable.read", "M16"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m16.timetable.manage", "M16"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]


def _param(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.get("/rooms")
async def rooms(auth: Reader, page: Paging) -> Page[RoomOut]:
    return await read_page(auth.ctx.db, select(Room).order_by(Room.list_order, Room.id), RoomOut, page)


@router.get("/bell-schedules")
async def bell_schedules(auth: Reader, page: Paging) -> Page[BellScheduleOut]:
    query = select(BellSchedule).order_by(BellSchedule.list_order, BellSchedule.id)
    return await read_page(auth.ctx.db, query, BellScheduleOut, page)


@router.get("/timetable-slots")
async def timetable_slots(
    auth: Reader,
    page: Paging,
    class_group_id: Annotated[str | None, Query(alias="classGroupId")] = None,
    staff_profile_id: Annotated[str | None, Query(alias="staffProfileId")] = None,
) -> Page[TimetableSlotOut]:
    return await slot_page(auth, page, _param(class_group_id), _param(staff_profile_id))


@router.post(
    "/timetable-slots",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": TimetableSlotIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_timetable_slot(auth: Manager, request: Request) -> TimetableSlotOut:
    # Module and permission (guard) before the body is read.
    return await create_slot(auth, parse_slot(await request.body()))


@router.get("/teacher-load")
async def teacher_load(
    auth: Reader, page: Paging, academic_year_id: Annotated[str | None, Query(alias="academicYearId")] = None
) -> Page[TeacherLoadOut]:
    return await teacher_loads(auth, page, _param(academic_year_id))
