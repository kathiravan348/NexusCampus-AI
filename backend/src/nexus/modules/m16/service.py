"""M16 timetable operations in the caller's tenant transaction (order and messages as `m16.ts`)."""

from typing import Any

from pydantic import BaseModel, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import and_, func, insert, or_, select
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.modules.m01.models import AcademicCalendar
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m02.service import family_of
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup, SubjectOffering
from nexus.modules.m16.models import Room, TimetableSlot
from nexus.modules.m16.schemas import TeacherLoadOut, TimetableSlotIn, TimetableSlotOut

SLOT_KEYS = [to_camel(name) for name in TimetableSlotIn.model_fields]


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=True)
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored timetable data.") from None


def _bad(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


def _clash(path: str, message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path=path, message=message)])


async def is_staff(auth: Authorized) -> bool:
    found = await auth.ctx.db.scalar(
        select(RoleProfile.id).where(RoleProfile.person_id == auth.ctx.person_id, RoleProfile.kind == "staff").limit(1)
    )
    return found is not None


async def family_class_groups(auth: Authorized) -> set[str]:
    db = auth.ctx.db
    family = await family_of(db, auth.ctx.person_id)
    learners = select(Learner.id).where(Learner.person_id.in_(family))
    rows = await db.scalars(
        select(Enrolment.class_group_id).where(Enrolment.status == "active", Enrolment.learner_id.in_(learners))
    )
    return set(rows)


async def slot_page(
    auth: Authorized, page: PageQuery, class_group_id: str | None, staff_profile_id: str | None
) -> Page[TimetableSlotOut]:
    db = auth.ctx.db
    if (
        class_group_id is not None
        and await db.scalar(select(ClassGroup.id).where(ClassGroup.id == class_group_id)) is None
    ):
        raise not_found()
    if staff_profile_id is not None and (
        await db.scalar(select(RoleProfile.id).where(RoleProfile.id == staff_profile_id, RoleProfile.kind == "staff"))
        is None
    ):
        raise not_found()
    offerings = select(SubjectOffering.id)
    if class_group_id is not None:
        offerings = offerings.where(SubjectOffering.class_group_id == class_group_id)
    if not await is_staff(auth):
        offerings = offerings.where(SubjectOffering.class_group_id.in_(await family_class_groups(auth)))
    query = select(TimetableSlot).where(TimetableSlot.subject_offering_id.in_(offerings))
    if staff_profile_id is not None:
        query = query.where(TimetableSlot.staff_profile_ids.any_() == staff_profile_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(TimetableSlot.list_order, TimetableSlot.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([stored(TimetableSlotOut, row) for row in rows], total or 0, page)


def parse_slot(body: bytes) -> TimetableSlotIn:
    """`400` with input keys only (in contract order), as the mock's `readSlotInput`."""
    try:
        data = TimetableSlotIn.model_validate_json(body)
    except ValidationError as exc:
        paths = {str(issue["loc"][0]) for issue in exc.errors(include_input=False) if issue["loc"]}
        failed = [key for key in SLOT_KEYS if key in paths]
    else:
        failed = [key for key in SLOT_KEYS if key in data.rule_paths()]
        if not failed:
            return data
    details = [ApiErrorDetail(path=key, message="Invalid timetable slot field") for key in failed]
    raise ApiError(400, "invalid_request", "The request is not valid.", details or None)


async def create_slot(auth: Authorized, data: TimetableSlotIn) -> TimetableSlotOut:
    db = auth.ctx.db
    calendar = await db.get(AcademicCalendar, data.academic_year_id)
    if calendar is None:
        raise _bad("academicYearId", "Academic year does not belong to this tenant")
    if data.period_id is not None and not any(p.get("id") == data.period_id for p in calendar.periods or []):
        raise _bad("periodId", "Academic period does not belong to this academic year")
    offering = await db.get(SubjectOffering, data.subject_offering_id)
    if offering is None:
        raise _bad("subjectOfferingId", "Subject offering does not belong to this tenant")
    if offering.academic_year_id != data.academic_year_id:
        raise _bad("academicYearId", "Academic year does not match subject offering")
    if data.room_id is not None and await db.scalar(select(Room.id).where(Room.id == data.room_id)) is None:
        raise _bad("roomId", "Room does not belong to this tenant")
    if data.staff_profile_ids:
        staff = set(
            await db.scalars(
                select(RoleProfile.id).where(RoleProfile.id.in_(data.staff_profile_ids), RoleProfile.kind == "staff")
            )
        )
        if staff != set(data.staff_profile_ids):
            raise _bad("staffProfileIds", "Staff profile does not belong to this tenant")

    # Same weekday, overlapping times and overlapping effective dates.
    overlapping = (
        await db.scalars(
            select(TimetableSlot).where(
                TimetableSlot.weekday == data.weekday,
                TimetableSlot.start < data.end,
                TimetableSlot.end > data.start,
                or_(TimetableSlot.effective_to.is_(None), TimetableSlot.effective_to >= data.effective_from),
                *([] if data.effective_to is None else [TimetableSlot.effective_from <= data.effective_to]),
            )
        )
    ).all()
    if data.room_id is not None and any(other.room_id == data.room_id for other in overlapping):
        raise _clash("roomId", "Room is already booked at this time")
    wanted = set(data.staff_profile_ids)
    if wanted and any(wanted & set(other.staff_profile_ids) for other in overlapping):
        raise _clash("staffProfileIds", "Staff member is already scheduled at this time")
    other_offerings = {other.subject_offering_id for other in overlapping}
    if other_offerings and await db.scalar(
        select(func.count()).where(
            and_(SubjectOffering.id.in_(other_offerings), SubjectOffering.class_group_id == offering.class_group_id)
        )
    ):
        raise _clash("subjectOfferingId", "Class group already has a slot at this time")

    statement = (
        insert(TimetableSlot)
        .values(
            **data.model_dump(by_alias=False),
            id=new_id("tts").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
        )
        .returning(TimetableSlot)
    )
    try:
        slot = stored(TimetableSlotOut, (await db.execute(statement)).scalar_one())
    except StatementError:
        raise ApiError(500, "internal", "Could not create the timetable slot.") from None
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m16.timetableSlot.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="timetableSlot",
            target_id=slot.id,
            changes=changes(*data.model_dump(by_alias=True)),
        ),
    )
    return slot


def _minutes(time: str) -> int:
    return int(time[:2]) * 60 + int(time[3:5])


async def teacher_loads(auth: Authorized, page: PageQuery, academic_year_id: str | None) -> Page[TeacherLoadOut]:
    db = auth.ctx.db
    if not await is_staff(auth):
        raise ApiError(403, "forbidden", "You do not have permission to do this.")
    if academic_year_id is not None and await db.get(AcademicCalendar, academic_year_id) is None:
        raise not_found()
    query = select(TimetableSlot).order_by(TimetableSlot.list_order, TimetableSlot.id)
    if academic_year_id is not None:
        query = query.where(TimetableSlot.academic_year_id == academic_year_id)
    loads: dict[tuple[str, str, str | None], dict[str, Any]] = {}
    for slot in await db.scalars(query):
        duration = _minutes(slot.end) - _minutes(slot.start)
        for staff in slot.staff_profile_ids:
            key = (staff, slot.academic_year_id, slot.period_id)
            load = loads.setdefault(
                key,
                {
                    "staff_profile_id": staff,
                    "academic_year_id": slot.academic_year_id,
                    "period_id": slot.period_id,
                    "weekly_periods": 0,
                    "weekly_minutes": 0,
                    "max_weekly_periods": None,
                    "overloaded": False,
                },
            )
            load["weekly_periods"] += 1
            load["weekly_minutes"] += duration
    items = list(loads.values())
    window = items[page.offset : page.offset + page.page_size]
    return Page.of([TeacherLoadOut.model_validate(item) for item in window], len(items), page)
