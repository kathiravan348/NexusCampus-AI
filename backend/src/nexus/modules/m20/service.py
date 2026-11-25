"""M20 gradebook operations in the caller's tenant transaction (order, errors and scope as `m20.ts`)."""

from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup, SubjectOffering
from nexus.modules.m17.schemas import RosterEntryOut
from nexus.modules.m17.service import _natural, active_staff
from nexus.modules.m18.service import family_learner_ids
from nexus.modules.m20.models import Assessment, MarkEntry, Rubric
from nexus.modules.m20.schemas import AssessmentOut, MarkEntryIn, MarkEntryOut

READ, ENTER = "m20.marks.read", "m20.marks.enter"
REMARK_FIELD = "mark_entries.remark"


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=not isinstance(value, dict))
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored gradebook data.") from None


def _bad(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


async def assessment_page(auth: Authorized, page: PageQuery, class_group_id: str | None) -> Page[AssessmentOut]:
    db = auth.ctx.db
    query = select(Assessment)
    if class_group_id is not None:
        if await db.scalar(select(ClassGroup.id).where(ClassGroup.id == class_group_id)) is None:
            raise not_found()
        offerings = select(SubjectOffering.id).where(SubjectOffering.class_group_id == class_group_id)
        query = query.where(Assessment.subject_offering_id.in_(offerings))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(Assessment.list_order, Assessment.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([stored(AssessmentOut, row) for row in rows], total or 0, page)


async def assessment_of(auth: Authorized, assessment_id: str) -> Assessment:
    assessment = await auth.ctx.db.get(Assessment, assessment_id)
    if assessment is None:
        raise not_found()
    return assessment


async def roster_of(auth: Authorized, offering_id: str, on: date) -> list[RosterEntryOut]:
    """Learners placed in the offering's class group on `on`, roll numbers in natural order, one row each.
    M20 uses today's date; M21 uses the exam paper's date."""
    db = auth.ctx.db
    group = await db.scalar(select(SubjectOffering.class_group_id).where(SubjectOffering.id == offering_id))
    if group is None:
        return []
    rows = await db.execute(
        select(Enrolment.learner_id, Enrolment.roll_number).where(
            Enrolment.class_group_id == group,
            Enrolment.learner_id.in_(select(Learner.id)),
            Enrolment.effective_from <= on,
            or_(Enrolment.effective_to.is_(None), Enrolment.effective_to >= on),
        )
    )
    placements = sorted(
        rows.all(), key=lambda row: (row.roll_number is None, _natural(row.roll_number or ""), row.learner_id)
    )
    seen: set[str] = set()
    roster = []
    for row in placements:
        if row.learner_id not in seen:
            seen.add(row.learner_id)
            roster.append(RosterEntryOut(learner_id=row.learner_id, roll_number=row.roll_number))
    return roster


def today() -> date:
    return datetime.now(UTC).date()


async def _entry_out(row: MarkEntry, cipher: FieldCipher, show_remark: bool) -> MarkEntryOut:
    remark = None
    if show_remark and row.remark is not None:
        remark = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), REMARK_FIELD, row.remark)
    values = {key: getattr(row, key) for key in MarkEntryOut.model_fields if key != "remark"}
    return stored(MarkEntryOut, {**values, "remark": remark})


async def mark_page(auth: Authorized, page: PageQuery, assessment_id: str, cipher: FieldCipher) -> Page[MarkEntryOut]:
    db = auth.ctx.db
    family = await family_learner_ids_for(auth)
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None or (family is not None and assessment.status != "published"):
        raise not_found()
    query = select(MarkEntry).where(MarkEntry.assessment_id == assessment.id)
    if family is not None:
        query = query.where(MarkEntry.learner_id.in_(family))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(query.order_by(MarkEntry.list_order, MarkEntry.id).limit(page.page_size).offset(page.offset))
    ).all()
    items = [await _entry_out(row, cipher, family is None) for row in rows]
    if any(item.remark is not None for item in items):
        await record_audit(
            db,
            auth.ctx.tenant,
            AuditInput(
                action="m20.markEntry.sensitiveRead",
                actor_kind="user",
                actor_id=auth.ctx.user_id,
                target_type="assessment",
                target_id=assessment.id,
                changes=changes("remark", sensitive=("remark",)),
            ),
        )
    return Page.of(items, total or 0, page)


async def family_learner_ids_for(auth: Authorized) -> set[str] | None:
    """M18's family rule with M20's read permission: `None` = every learner."""
    return await family_learner_ids(auth, read_permission=READ)


def parse_mark(body: bytes) -> MarkEntryIn:
    try:
        data = MarkEntryIn.model_validate_json(body)
    except ValidationError as exc:
        paths = [
            "" if not issue["loc"] or issue["type"] == "extra_forbidden" else to_camel(str(issue["loc"][0]))
            for issue in exc.errors(include_input=False)
        ]
    else:
        rule = data.rule_path()
        if rule is None:
            return data
        paths = [rule]
    raise ApiError(
        400,
        "invalid_request",
        "The request is not valid.",
        [ApiErrorDetail(path=path, message="Invalid mark entry") for path in paths],
    )


def _rubric_scores_valid(criteria: list[dict[str, Any]], scores: dict[str, int] | None) -> bool:
    if scores is None or len(scores) != len(criteria):
        return False
    for criterion in criteria:
        code = criterion.get("code")
        if code not in scores or not any(level.get("score") == scores[code] for level in criterion.get("levels", [])):
            return False
    return True


async def save_mark(
    auth: Authorized, assessment_id: str, learner_id: str, body: bytes, cipher: FieldCipher
) -> MarkEntryOut:
    db = auth.ctx.db
    staff = await active_staff(auth)
    assessment = await assessment_of(auth, assessment_id)
    if assessment.status not in {"open", "marking"}:
        raise ApiError(
            409,
            "conflict",
            "Assessment is not open for marking",
            [ApiErrorDetail(path="status", message="Assessment is not open for marking")],
        )
    data = parse_mark(body)
    if not any(
        entry.learner_id == learner_id for entry in await roster_of(auth, assessment.subject_offering_id, today())
    ):
        raise _bad("learnerId", "Outside the assessment roster")
    if data.marks is not None and data.marks > float(assessment.max_marks):
        raise _bad("marks", "Marks exceed the assessment maximum")
    if assessment.rubric_id is None:
        if data.rubric_scores is not None:
            raise _bad("rubricScores", "Assessment has no rubric")
    elif data.absent:
        if data.rubric_scores is not None:
            raise _bad("rubricScores", "Absent learner cannot have rubric scores")
    else:
        rubric = await db.get(Rubric, assessment.rubric_id)
        if rubric is None or not _rubric_scores_valid(rubric.criteria, data.rubric_scores):
            raise _bad("rubricScores", "Invalid rubric scores")

    tenant = auth.ctx.tenant.tenant_id
    remark = (
        None
        if data.remark is None
        else await cipher.encrypt(key_name(tenant, "tenant_data"), REMARK_FIELD, data.remark)
    )
    values = {
        "marks": data.marks,
        "absent": data.absent,
        "rubric_scores": data.rubric_scores,
        "remark": remark,
        "entered_by_staff_profile_id": staff,
        "device_id": None,
    }
    upsert = insert(MarkEntry).values(
        id=new_id("mrk").replace("_", "-", 1),
        tenant_id=tenant,
        assessment_id=assessment.id,
        learner_id=learner_id,
        **values,
    )
    # One entry per assessment and learner: an update keeps the id (as the mock).
    statement = upsert.on_conflict_do_update(
        constraint="uq_mark_entries_learner", set_={**values, "entered_at": func.now()}
    ).returning(MarkEntry)
    try:
        row = (await db.execute(statement)).scalar_one()
    except StatementError:
        raise ApiError(500, "internal", "Could not save the mark.") from None
    fields = {key: getattr(row, key) for key in MarkEntryOut.model_fields if key != "remark"}
    entry = stored(MarkEntryOut, {**fields, "remark": data.remark})
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m20.markEntry.saved",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="markEntry",
            target_id=entry.id,
            changes=changes("marks", "absent", "rubricScores", "remark", sensitive=("remark",)),
        ),
    )
    return entry
