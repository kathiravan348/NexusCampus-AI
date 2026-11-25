"""M86 year-end rollover (D84) in the caller's tenant transaction: dry run, override, confirm, roll back.

Order and errors follow the NEX-208 mock. Confirm and roll back each run in one transaction; a decision stores what
it changed, so a roll-back inside the 14-day window restores enrolments and learner statuses exactly.
"""

from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import delete, func, insert, select, update

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.permissions import Authorized
from nexus.modules.m01.models import AcademicCalendar, Institution
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup, YearLevel
from nexus.modules.m86.models import PromotionDecision, RolloverRun
from nexus.modules.m86.schemas import PromotionDecisionIn, PromotionDecisionOut, RolloverRunIn, RolloverRunOut

ROLLBACK_WINDOW = timedelta(days=14)
OPEN = ("draft", "dry_run_ready", "running")
ACTIONS = ("promote", "detain", "graduate", "transfer", "skip")
LEAVING_STATUS = {"graduate": "graduated", "transfer": "transferred_out"}


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def conflict(path: str, message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path=path, message=message)])


def invalid(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


def run_out(run: RolloverRun) -> RolloverRunOut:
    counts = {action: getattr(run, f"{action}_count") for action in ACTIONS}
    values = {key: getattr(run, key) for key in RolloverRunOut.model_fields if key != "counts"}
    return RolloverRunOut.model_validate({**values, "counts": counts})


def decision_out(decision: PromotionDecision) -> PromotionDecisionOut:
    return PromotionDecisionOut.model_validate(decision, from_attributes=True)


def parse[In: BaseModel](schema: type[In], body: bytes, message: str) -> In:
    """`400` with the first key of each issue (unknown keys and bad JSON → `""`), then the model rule."""
    try:
        data = schema.model_validate_json(body)
    except ValidationError as exc:
        paths = [
            "" if not issue["loc"] or issue["type"] == "extra_forbidden" else to_camel(str(issue["loc"][0]))
            for issue in exc.errors(include_input=False)
        ]
    else:
        rule: str | None = data.rule_path()  # type: ignore[attr-defined]
        if rule is None:
            return data
        paths = [rule]
    raise ApiError(
        400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=p, message=message) for p in paths]
    )


async def _audit(auth: Authorized, action: str, target: str, *fields: str) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="rolloverRun",
            target_id=target,
            changes=changes(*fields),
        ),
    )


async def run_of(auth: Authorized, run_id: str) -> RolloverRun:
    run = await auth.ctx.db.get(RolloverRun, run_id)
    if run is None:
        raise not_found()
    return run


async def _recount(auth: Authorized, run: RolloverRun) -> None:
    db = auth.ctx.db
    counts = Counter(await db.scalars(select(PromotionDecision.action).where(PromotionDecision.run_id == run.id)))
    await db.execute(
        update(RolloverRun)
        .where(RolloverRun.id == run.id)
        .values(
            **{f"{action}_count": counts.get(action, 0) for action in ACTIONS},
            updated_at=func.greatest(func.now(), RolloverRun.updated_at),
        )
        .execution_options(synchronize_session=False)
    )


async def _plan(auth: Authorized, run_id: str, institution: str, from_year: str, to_year: str) -> list[dict[str, Any]]:
    """D84 dry run: one decision per learner with an active enrolment in the institution's from-year groups."""
    db = auth.ctx.db
    groups = {
        row.id: row for row in await db.scalars(select(ClassGroup).where(ClassGroup.institution_id == institution))
    }
    levels = {row.id: row for row in await db.scalars(select(YearLevel))}
    by_order = {(row.program_id, row.order): row for row in levels.values()}
    enrolments = await db.scalars(
        select(Enrolment)
        .where(Enrolment.status == "active", Enrolment.academic_year_id == from_year)
        .order_by(Enrolment.created_at, Enrolment.id)
    )
    plans: list[dict[str, Any]] = []
    seen: set[str] = set()
    for enrolment in enrolments:
        group = groups.get(enrolment.class_group_id)
        if group is None or enrolment.learner_id in seen:
            continue
        seen.add(enrolment.learner_id)
        level = levels.get(group.year_level_id) if group.year_level_id else None
        upcoming = by_order.get((level.program_id, level.order + 1)) if level else None
        targets = sorted(
            (
                row
                for row in groups.values()
                if upcoming is not None
                and row.academic_year_id == to_year
                and row.program_id == upcoming.program_id
                and row.year_level_id == upcoming.id
            ),
            key=lambda row: (row.code, row.id),
        )
        action: str = "skip"
        target: str | None = None
        reason: str | None = "m86.promotion.noTargetGroup"
        if level is None:
            reason = "m86.promotion.noYearLevel"
        elif upcoming is None:
            action, reason = "graduate", None
        elif targets:
            action, target, reason = "promote", targets[0].id, None
        plans.append(
            {
                "id": new_id("pd").replace("_", "-", 1),
                "tenant_id": auth.ctx.tenant.tenant_id,
                "run_id": run_id,
                "learner_id": enrolment.learner_id,
                "action": action,
                "to_class_group_id": target,
                "reason_key": reason,
                "previous_enrolment_id": enrolment.id,
            }
        )
    return plans


async def create_run(auth: Authorized, staff_id: str, body: bytes) -> RolloverRunOut:
    db = auth.ctx.db
    data = parse(RolloverRunIn, body, "Invalid rollover run")
    if await db.get(Institution, data.institution_id) is None:
        raise invalid("institutionId", "Invalid institution")
    for key in ("from_academic_year_id", "to_academic_year_id"):
        if await db.get(AcademicCalendar, getattr(data, key)) is None:
            raise invalid(to_camel(key), "Invalid academic year")
    open_run = await db.scalar(
        select(RolloverRun.id).where(
            RolloverRun.institution_id == data.institution_id,
            RolloverRun.from_academic_year_id == data.from_academic_year_id,
            RolloverRun.status.in_(OPEN),
        )
    )
    if open_run is not None:
        raise conflict("fromAcademicYearId", "A rollover run is already open for this year")
    run_id = new_id("roll").replace("_", "-", 1)
    plans = await _plan(auth, run_id, data.institution_id, data.from_academic_year_id, data.to_academic_year_id)
    counts = Counter(plan["action"] for plan in plans)
    await db.execute(
        insert(RolloverRun).values(
            id=run_id,
            tenant_id=auth.ctx.tenant.tenant_id,
            institution_id=data.institution_id,
            from_academic_year_id=data.from_academic_year_id,
            to_academic_year_id=data.to_academic_year_id,
            status="dry_run_ready",
            **{f"{action}_count": counts.get(action, 0) for action in ACTIONS},
            carry_forward_fees=data.carry_forward_fees,
            rollback_until=None,
            created_by_staff_profile_id=staff_id,
        )
    )
    if plans:
        await db.execute(insert(PromotionDecision), plans)
    await _audit(auth, "m86.rolloverRun.created", run_id, *(to_camel(key) for key in RolloverRunIn.model_fields))
    return run_out(await run_of(auth, run_id))


async def override(auth: Authorized, staff_id: str, run_id: str, decision_id: str, body: bytes) -> PromotionDecisionOut:
    db = auth.ctx.db
    run = await run_of(auth, run_id)
    decision = await db.scalar(
        select(PromotionDecision).where(PromotionDecision.id == decision_id, PromotionDecision.run_id == run.id)
    )
    if decision is None:
        raise not_found()
    if run.status != "dry_run_ready":
        raise conflict("status", "The dry run is not open for changes")
    data = parse(PromotionDecisionIn, body, "Invalid decision")
    if data.to_class_group_id is not None:
        group = await db.get(ClassGroup, data.to_class_group_id)
        if (
            group is None
            or group.academic_year_id != run.to_academic_year_id
            or group.institution_id != run.institution_id
        ):
            raise invalid("toClassGroupId", "Choose a class group of the next academic year")
    await db.execute(
        update(PromotionDecision)
        .where(PromotionDecision.id == decision.id)
        .values(
            action=data.action,
            to_class_group_id=data.to_class_group_id,
            reason_key=data.reason_key,
            overridden_by_staff_profile_id=staff_id,
        )
        .execution_options(synchronize_session=False)
    )
    await _recount(auth, run)
    await db.refresh(decision)
    await _audit(auth, "m86.rolloverRun.decisionOverridden", run.id, "action", "toClassGroupId", "reasonKey")
    return decision_out(decision)


async def confirm(auth: Authorized, run_id: str) -> RolloverRunOut:
    db = auth.ctx.db
    run = await run_of(auth, run_id)
    if run.status != "dry_run_ready":
        raise conflict("status", "The dry run is not ready to confirm")
    to_year = await db.get(AcademicCalendar, run.to_academic_year_id)
    if to_year is None:
        raise invalid("toAcademicYearId", "Invalid academic year")
    closes_on = to_year.starts_on - timedelta(days=1)
    decisions = (await db.scalars(select(PromotionDecision).where(PromotionDecision.run_id == run.id))).all()
    for decision in decisions:
        if decision.action == "skip" or decision.previous_enrolment_id is None:
            continue
        previous = await db.get(Enrolment, decision.previous_enrolment_id)
        learner = await db.get(Learner, decision.learner_id)
        if previous is None or learner is None or previous.status != "active":
            continue  # changed since the dry run: leave it alone
        await db.execute(
            update(Enrolment)
            .where(Enrolment.id == previous.id)
            .values(status="completed", effective_to=max(closes_on, previous.effective_from))
            .execution_options(synchronize_session=False)
        )
        new_enrolment = None
        if decision.action in {"promote", "detain"} and decision.to_class_group_id is not None:
            group = await db.get(ClassGroup, decision.to_class_group_id)
            if group is not None:
                new_enrolment = new_id("enr").replace("_", "-", 1)
                await db.execute(
                    insert(Enrolment).values(
                        id=new_enrolment,
                        tenant_id=run.tenant_id,
                        learner_id=decision.learner_id,
                        academic_year_id=run.to_academic_year_id,
                        program_id=group.program_id,
                        year_level_id=group.year_level_id,
                        class_group_id=group.id,
                        roll_number=None,
                        status="active",
                        effective_from=to_year.starts_on,
                    )
                )
        leaving = LEAVING_STATUS.get(decision.action)
        if leaving is not None:
            await db.execute(
                update(Learner)
                .where(Learner.id == learner.id)
                .values(status=leaving, left_on=max(closes_on, learner.admission_date))
                .execution_options(synchronize_session=False)
            )
        await db.execute(
            update(PromotionDecision)
            .where(PromotionDecision.id == decision.id)
            .values(
                new_enrolment_id=new_enrolment,
                previous_learner_status=learner.status if leaving else None,
                previous_left_on=learner.left_on if leaving else None,
            )
            .execution_options(synchronize_session=False)
        )
    await db.execute(
        update(RolloverRun)
        .where(RolloverRun.id == run.id)
        .values(
            status="completed",
            rollback_until=datetime.now(UTC) + ROLLBACK_WINDOW,
            updated_at=func.greatest(func.now(), RolloverRun.updated_at),
        )
        .execution_options(synchronize_session=False)
    )
    await _audit(auth, "m86.rolloverRun.confirmed", run.id, "status")
    await db.refresh(run)
    return run_out(run)


async def rollback(auth: Authorized, run_id: str) -> RolloverRunOut:
    db = auth.ctx.db
    run = await run_of(auth, run_id)
    if run.status != "completed" or run.rollback_until is None or run.rollback_until <= datetime.now(UTC):
        raise conflict("rollbackUntil", "The roll-back window has closed")
    decisions = (await db.scalars(select(PromotionDecision).where(PromotionDecision.run_id == run.id))).all()
    for decision in decisions:
        if decision.new_enrolment_id is not None:
            await db.execute(delete(Enrolment).where(Enrolment.id == decision.new_enrolment_id))
        if decision.previous_enrolment_id is not None and decision.action != "skip":
            await db.execute(
                update(Enrolment)
                .where(Enrolment.id == decision.previous_enrolment_id, Enrolment.status == "completed")
                .values(status="active", effective_to=None)
                .execution_options(synchronize_session=False)
            )
        if decision.previous_learner_status is not None:
            await db.execute(
                update(Learner)
                .where(Learner.id == decision.learner_id)
                .values(status=decision.previous_learner_status, left_on=decision.previous_left_on)
                .execution_options(synchronize_session=False)
            )
        await db.execute(
            update(PromotionDecision)
            .where(PromotionDecision.id == decision.id)
            .values(new_enrolment_id=None, previous_learner_status=None, previous_left_on=None)
            .execution_options(synchronize_session=False)
        )
    await db.execute(
        update(RolloverRun)
        .where(RolloverRun.id == run.id)
        .values(status="rolled_back", rollback_until=None, updated_at=func.greatest(func.now(), RolloverRun.updated_at))
        .execution_options(synchronize_session=False)
    )
    await _audit(auth, "m86.rolloverRun.rolledBack", run.id, "status")
    await db.refresh(run)
    return run_out(run)
