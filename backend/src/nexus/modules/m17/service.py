"""M17 attendance operations in the caller's tenant transaction (order, errors and masking as `m17.ts`)."""

import re
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import func, insert, or_, select
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m02.service import family_of
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup
from nexus.modules.m17.models import AttendanceMark, AttendanceSession, LeaveRequest
from nexus.modules.m17.schemas import (
    AttendanceMarkIn,
    AttendanceMarkOut,
    AttendanceSessionOut,
    LeaveRequestOut,
    RosterEntryOut,
)

READ, MARK, DECIDE = "m17.attendance.read", "m17.attendance.mark", "m17.leave.decide"
NOTE_FIELD, REASON_FIELD = "attendance_marks.note", "leave_requests.reason"


def forbidden() -> ApiError:
    return ApiError(403, "forbidden", "You do not have permission to do this.")


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=not isinstance(value, dict))
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored attendance data.") from None


async def is_staff(auth: Authorized) -> bool:
    found = await auth.ctx.db.scalar(
        select(RoleProfile.id).where(RoleProfile.person_id == auth.ctx.person_id, RoleProfile.kind == "staff").limit(1)
    )
    return found is not None


async def family_learners(auth: Authorized) -> set[str]:
    """Learner ids of the viewer's family; `403` when there are none (as the mock's `familyLearners`)."""
    db = auth.ctx.db
    family = await family_of(db, auth.ctx.person_id)
    learners = set(await db.scalars(select(Learner.id).where(Learner.person_id.in_(family))))
    if not learners:
        raise forbidden()
    return learners


async def session_of(auth: Authorized, session_id: str) -> AttendanceSession:
    session = await auth.ctx.db.get(AttendanceSession, session_id)
    if session is None:
        raise not_found()
    return session


async def session_page(auth: Authorized, page: PageQuery, class_group_id: str | None) -> Page[AttendanceSessionOut]:
    if not await is_staff(auth):
        raise forbidden()
    db = auth.ctx.db
    if (
        class_group_id is not None
        and await db.scalar(select(ClassGroup.id).where(ClassGroup.id == class_group_id)) is None
    ):
        raise not_found()
    query = select(AttendanceSession)
    if class_group_id is not None:
        query = query.where(AttendanceSession.class_group_id == class_group_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(AttendanceSession.list_order, AttendanceSession.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([stored(AttendanceSessionOut, row) for row in rows], total or 0, page)


def _natural(roll: str) -> list[tuple[int, Any]]:
    # `localeCompare(..., { numeric: true })`: digit runs compare as numbers.
    return [(0, int(part)) if part.isdigit() else (1, part.lower()) for part in re.split(r"(\d+)", roll) if part]


async def roster_of(auth: Authorized, session: AttendanceSession) -> list[RosterEntryOut]:
    if session.class_group_id is None:
        return []
    rows = await auth.ctx.db.execute(
        select(Enrolment.learner_id, Enrolment.roll_number).where(
            Enrolment.class_group_id == session.class_group_id,
            Enrolment.learner_id.in_(select(Learner.id)),
            Enrolment.effective_from <= session.date,
            or_(Enrolment.effective_to.is_(None), Enrolment.effective_to >= session.date),
        )
    )
    placements = sorted(
        rows.all(),
        key=lambda row: (row.roll_number is None, _natural(row.roll_number or ""), row.learner_id),
    )
    seen: set[str] = set()
    roster = []
    for row in placements:
        if row.learner_id not in seen:
            seen.add(row.learner_id)
            roster.append(RosterEntryOut(learner_id=row.learner_id, roll_number=row.roll_number))
    return roster


async def roster_page(auth: Authorized, page: PageQuery, session_id: str) -> Page[RosterEntryOut]:
    if not await is_staff(auth):
        raise forbidden()
    roster = await roster_of(auth, await session_of(auth, session_id))
    return Page.of(roster[page.offset : page.offset + page.page_size], len(roster), page)


async def _mark_out(auth: Authorized, row: AttendanceMark, cipher: FieldCipher, show_note: bool) -> AttendanceMarkOut:
    note = None
    if show_note and row.note is not None:
        note = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), NOTE_FIELD, row.note)
    fields = {key: getattr(row, key) for key in AttendanceMarkOut.model_fields if key != "note"}
    return stored(AttendanceMarkOut, {**fields, "note": note})


async def _sensitive_read(auth: Authorized, action: str, target_type: str, target_id: str, field: str) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes(field, sensitive=(field,)),
        ),
    )


async def mark_page(auth: Authorized, page: PageQuery, session_id: str, cipher: FieldCipher) -> Page[AttendanceMarkOut]:
    db = auth.ctx.db
    read_all = auth.grants.has(READ) and await is_staff(auth)
    family = None if read_all else await family_learners(auth)
    session = await session_of(auth, session_id)
    show_note = auth.grants.has(MARK)
    query = select(AttendanceMark).where(AttendanceMark.session_id == session.id)
    if family is not None:
        query = query.where(AttendanceMark.learner_id.in_(family))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(AttendanceMark.list_order, AttendanceMark.id).limit(page.page_size).offset(page.offset)
        )
    ).all()
    items = [await _mark_out(auth, row, cipher, show_note) for row in rows]
    if any(item.note is not None for item in items):
        await _sensitive_read(auth, "m17.attendanceMark.sensitiveRead", "attendanceSession", session.id, "note")
    return Page.of(items, total or 0, page)


async def leave_page(auth: Authorized, page: PageQuery, cipher: FieldCipher) -> Page[LeaveRequestOut]:
    db = auth.ctx.db
    can_decide = auth.grants.has(DECIDE)
    # Staff need the decision permission even if they also have a family link.
    if not can_decide and await is_staff(auth):
        raise forbidden()
    family = None if can_decide else await family_learners(auth)
    query = select(LeaveRequest)
    if family is not None:
        query = query.where(LeaveRequest.learner_id.in_(family))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(LeaveRequest.list_order, LeaveRequest.id).limit(page.page_size).offset(page.offset)
        )
    ).all()
    items = []
    for row in rows:
        reason = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), REASON_FIELD, row.reason)
        fields = {key: getattr(row, key) for key in LeaveRequestOut.model_fields if key != "reason"}
        items.append(stored(LeaveRequestOut, {**fields, "reason": reason}))
    if items:
        await _sensitive_read(auth, "m17.leaveRequest.sensitiveRead", "leaveRequest", "leaveRequestList", "reason")
    return Page.of(items, total or 0, page)


async def active_staff(auth: Authorized) -> str:
    today = datetime.now(UTC).date()
    profile = await auth.ctx.db.scalar(
        select(RoleProfile.id)
        .where(
            RoleProfile.person_id == auth.ctx.person_id,
            RoleProfile.kind == "staff",
            RoleProfile.status == "active",
            RoleProfile.effective_from <= today,
            or_(RoleProfile.effective_to.is_(None), RoleProfile.effective_to >= today),
        )
        .order_by(RoleProfile.id)
        .limit(1)
    )
    if profile is None:
        raise forbidden()
    return profile


def parse_mark(body: bytes) -> AttendanceMarkIn:
    """`400` with the first key of each issue (unknown keys and bad JSON → `""`), as the mock."""
    try:
        data = AttendanceMarkIn.model_validate_json(body)
    except ValidationError as exc:
        paths = []
        for issue in exc.errors(include_input=False):
            loc = issue["loc"]
            path = "" if not loc or issue["type"] == "extra_forbidden" else to_camel(str(loc[0]))
            paths.append(path)
    else:
        rule = data.rule_path()
        if rule is None:
            return data
        paths = [rule]
    details = [ApiErrorDetail(path=path, message="Invalid attendance mark") for path in paths]
    raise ApiError(400, "invalid_request", "The request is not valid.", details)


async def create_mark(
    auth: Authorized, session_id: str, body: bytes, cipher: FieldCipher, staff_profile_id: str
) -> AttendanceMarkOut:
    db = auth.ctx.db
    session = await session_of(auth, session_id)
    if session.status != "open":
        raise ApiError(
            409, "conflict", "Session is closed", [ApiErrorDetail(path="status", message="Session is closed")]
        )
    data = parse_mark(body)
    if not any(entry.learner_id == data.learner_id for entry in await roster_of(auth, session)):
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="learnerId", message="Outside the session roster")],
        )
    tenant = auth.ctx.tenant.tenant_id
    note = None if data.note is None else await cipher.encrypt(key_name(tenant, "tenant_data"), NOTE_FIELD, data.note)
    statement = (
        insert(AttendanceMark)
        .values(
            id=new_id("atm").replace("_", "-", 1),
            tenant_id=tenant,
            session_id=session.id,
            learner_id=data.learner_id,
            status=data.status,
            minutes_late=data.minutes_late,
            note=note,
            method="manual",
            marked_by_staff_profile_id=staff_profile_id,
            device_id=None,
        )
        .returning(AttendanceMark)
    )
    try:
        row = (await db.execute(statement)).scalar_one()
    except StatementError:
        raise ApiError(500, "internal", "Could not record the mark.") from None
    fields = {key: getattr(row, key) for key in AttendanceMarkOut.model_fields if key != "note"}
    mark = stored(AttendanceMarkOut, {**fields, "note": data.note})
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m17.attendanceMark.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="attendanceMark",
            target_id=mark.id,
            changes=changes("learnerId", "status", "minutesLate", "note", sensitive=("note",)),
        ),
    )
    return mark
