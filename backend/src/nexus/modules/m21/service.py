"""M21 exam operations in the caller's tenant transaction (order, errors, scope and seat labels as `m21.ts`)."""

from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, func, insert, select

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import PAGE_SIZE_MAX, Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m13.models import Learner
from nexus.modules.m16.models import Room
from nexus.modules.m17.service import active_staff
from nexus.modules.m18.service import family_learner_ids
from nexus.modules.m20.service import roster_of
from nexus.modules.m21.models import Exam, ExamPaper, HallTicket, RevaluationRequest, SeatAssignment
from nexus.modules.m21.schemas import HallTicketOut, RevaluationRequestOut, SeatAssignmentOut

READ, MANAGE = "m21.exams.read", "m21.exams.manage"
REASON_FIELD = "revaluation_requests.reason"


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=not isinstance(value, dict))
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored exam data.") from None


async def found[Row](auth: Authorized, model: type[Row], row_id: str) -> Row:
    row = await auth.ctx.db.get(model, row_id)
    if row is None:
        raise not_found()
    return row


async def ticket_page(auth: Authorized, page: PageQuery, learner_id: str | None) -> Page[HallTicketOut]:
    db = auth.ctx.db
    family = await family_learner_ids(auth, read_permission=READ)
    if learner_id is not None and (
        (family is not None and learner_id not in family)
        or await db.scalar(select(Learner.id).where(Learner.id == learner_id)) is None
    ):
        raise not_found()
    query = select(HallTicket)
    if family is not None:
        query = query.where(HallTicket.learner_id.in_(family))
    if learner_id is not None:
        query = query.where(HallTicket.learner_id == learner_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(HallTicket.list_order, HallTicket.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([stored(HallTicketOut, row) for row in rows], total or 0, page)


async def revaluation_page(auth: Authorized, page: PageQuery, cipher: FieldCipher) -> Page[RevaluationRequestOut]:
    db = auth.ctx.db
    family = await family_learner_ids(auth, read_permission=READ)
    query = select(RevaluationRequest)
    if family is not None:
        query = query.where(RevaluationRequest.learner_id.in_(family))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(RevaluationRequest.list_order, RevaluationRequest.id)
            .limit(page.page_size)
            .offset(page.offset)
        )
    ).all()
    items = []
    for row in rows:
        reason = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), REASON_FIELD, row.reason)
        values = {key: getattr(row, key) for key in RevaluationRequestOut.model_fields if key != "reason"}
        items.append(stored(RevaluationRequestOut, {**values, "reason": reason}))
    if items:
        await record_audit(
            db,
            auth.ctx.tenant,
            AuditInput(
                action="m21.revaluationRequest.sensitiveRead",
                actor_kind="user",
                actor_id=auth.ctx.user_id,
                target_type="revaluationRequest",
                target_id="revaluationRequestList",
                changes=changes("reason", sensitive=("reason",)),
            ),
        )
    return Page.of(items, total or 0, page)


def room_letters(index: int) -> str:
    """Room index → A … Z, AA, AB, … (spreadsheet style, as the mock)."""
    letter = chr(65 + index % 26)
    return letter if index < 26 else room_letters(index // 26 - 1) + letter


def _bad_rooms(message: str) -> ApiError:
    return ApiError(
        400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path="roomIds", message=message)]
    )


async def generate_seat_plan(auth: Authorized, paper_id: str) -> Page[SeatAssignmentOut]:
    db = auth.ctx.db
    await active_staff(auth)  # `m21.exams.manage` is checked by the guard; both refusals are `403 forbidden`
    paper = await found(auth, ExamPaper, paper_id)
    exam = await found(auth, Exam, paper.exam_id)
    if exam.status not in {"planned", "scheduled"}:
        raise ApiError(
            409,
            "conflict",
            "Exam is closed for seating",
            [ApiErrorDetail(path="status", message="Exam is closed for seating")],
        )
    roster = [entry.learner_id for entry in await roster_of(auth, paper.subject_offering_id, paper.date)]
    capacities = {row.id: row.capacity for row in await db.scalars(select(Room).where(Room.id.in_(paper.room_ids)))}
    seats: list[dict[str, str]] = []
    for index, room_id in enumerate(paper.room_ids):
        if room_id not in capacities:
            raise _bad_rooms("Invalid rooms")
        capacity = capacities[room_id]
        group = roster[len(seats) : len(seats) + (len(roster) if capacity is None else capacity)]
        for position, learner_id in enumerate(group):
            seats.append(
                {
                    "id": new_id("seat").replace("_", "-", 1),
                    "tenant_id": auth.ctx.tenant.tenant_id,
                    "exam_paper_id": paper.id,
                    "learner_id": learner_id,
                    "room_id": room_id,
                    "seat_label": f"{room_letters(index)}{position + 1}",
                }
            )
    if len(seats) != len(roster):
        raise _bad_rooms("Insufficient capacity")
    # A new plan replaces the paper's seats in the same transaction.
    await db.execute(delete(SeatAssignment).where(SeatAssignment.exam_paper_id == paper.id))
    if seats:
        await db.execute(insert(SeatAssignment), seats)
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m21.seatPlan.generated",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="examPaper",
            target_id=paper.id,
            changes=changes("seatAssignments"),
        ),
    )
    items = [SeatAssignmentOut.model_validate(seat) for seat in seats[:PAGE_SIZE_MAX]]
    return Page.of(items, len(seats), PageQuery(page=1, page_size=PAGE_SIZE_MAX))
