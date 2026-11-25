"""M25-M28 role homes and dashboard KPIs (rules as `m28.ts`): counts and aggregates of the viewer's tenant only."""

from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Select, func, or_, select
from sqlalchemy.sql.elements import ColumnElement

from nexus.core.entitlements import module_enabled
from nexus.core.errors import ApiError
from nexus.core.permissions import Authorized
from nexus.modules.m01.models import Institution
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m02.service import family_of
from nexus.modules.m12.models import Application
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup, SubjectOffering
from nexus.modules.m16.models import TimetableSlot
from nexus.modules.m17.models import AttendanceMark, AttendanceSession, LeaveRequest
from nexus.modules.m18.models import FeeInvoice
from nexus.modules.m24.models import MessageThread, ThreadMessage
from nexus.modules.m24.service import visible_notices
from nexus.modules.m28.schemas import HomeCard, KpiOut, RoleHomeOut

DASHBOARDS_READ = "m28.dashboards.read"
MESSAGES_READ, NOTICES_READ = "m24.messages.read", "m24.notices.read"
OPEN_APPLICATIONS = ("draft", "submitted", "under_review", "test_scheduled", "offered", "waitlisted")


def card(kind: str, module: str, href: str, count: int | None, title_key: str | None = None) -> HomeCard:
    return HomeCard.model_validate(
        {
            "kind": kind,
            "title_key": title_key or f"m28.card.{kind}",
            "module_id": module,
            "count": count,
            "severity": None,
            "href": href,
        }
    )


async def _institution(auth: Authorized) -> Institution:
    first = await auth.ctx.db.scalar(select(Institution).order_by(Institution.id).limit(1))
    if first is None:
        raise ApiError(403, "forbidden", "You do not have permission to do this.")
    return first


async def _today(auth: Authorized, now: datetime) -> date:
    institution = await _institution(auth)
    return now.astimezone(ZoneInfo(institution.time_zone)).date()


def _open_balance() -> ColumnElement[bool]:
    # As the mock's `outstanding`: only issued and part-paid invoices owe money.
    return FeeInvoice.status.in_(("issued", "part_paid"))


async def _count(auth: Authorized, query: Select[Any]) -> int:
    return int(await auth.ctx.db.scalar(select(func.count()).select_from(query.subquery())) or 0)


async def communication_cards(auth: Authorized, now: datetime) -> list[HomeCard]:
    if not await module_enabled(auth.ctx.db, auth.ctx.tenant.tenant_id, "M24"):
        return []
    person = auth.ctx.person_id
    cards = []
    if auth.grants.has(MESSAGES_READ):
        threads = select(MessageThread.id).where(
            MessageThread.archived.is_(False), MessageThread.participant_person_ids.any_() == person
        )
        unread = select(ThreadMessage.id).where(
            ThreadMessage.thread_id.in_(threads),
            ThreadMessage.sender_person_id != person,
            ~(ThreadMessage.read_by_person_ids.contains([person])),
        )
        cards.append(card("messages", "M24", "/messages", await _count(auth, unread)))
    if auth.grants.has(NOTICES_READ):
        cards.append(card("notices", "M24", "/notices", len(await visible_notices(auth))))
    return cards


async def learner_cards(auth: Authorized, learner_ids: list[str], now: datetime) -> list[HomeCard]:
    today = await _today(auth, now)
    monday = today - timedelta(days=today.weekday())
    sessions = select(AttendanceSession.id).where(AttendanceSession.date >= monday, AttendanceSession.date <= today)
    absences = select(AttendanceMark.id).where(
        AttendanceMark.status == "absent",
        AttendanceMark.learner_id.in_(learner_ids),
        AttendanceMark.session_id.in_(sessions),
    )
    unpaid = select(FeeInvoice.id).where(
        FeeInvoice.learner_id.in_(learner_ids), _open_balance(), FeeInvoice.total > FeeInvoice.paid
    )
    return [
        card("attendance", "M17", "/attendance", await _count(auth, absences), "m28.card.absences"),
        card("fees", "M18", "/fees", await _count(auth, unpaid)),
        *await communication_cards(auth, now),
    ]


async def staff_cards(auth: Authorized, staff_ids: list[str], now: datetime) -> list[HomeCard]:
    db = auth.ctx.db
    today = await _today(auth, now)
    homerooms = set(await db.scalars(select(ClassGroup.id).where(ClassGroup.homeroom_staff_profile_id.in_(staff_ids))))
    slots = select(TimetableSlot.id).where(TimetableSlot.staff_profile_ids.overlap(staff_ids))
    sessions = select(AttendanceSession.id).where(
        AttendanceSession.date == today,
        or_(
            AttendanceSession.taken_by_staff_profile_id.in_(staff_ids),
            AttendanceSession.timetable_slot_id.in_(slots),
            AttendanceSession.class_group_id.in_(homerooms),
        ),
    )
    groups = homerooms | set(
        await db.scalars(
            select(SubjectOffering.class_group_id).where(SubjectOffering.staff_profile_ids.overlap(staff_ids))
        )
    )
    learners = select(Enrolment.learner_id).where(Enrolment.status == "active", Enrolment.class_group_id.in_(groups))
    pending = select(LeaveRequest.id).where(LeaveRequest.status == "pending", LeaveRequest.learner_id.in_(learners))
    return [
        card("attendance", "M17", "/attendance", await _count(auth, sessions)),
        card("leave", "M17", "/attendance/leave", await _count(auth, pending)),
        *await communication_cards(auth, now),
    ]


async def dashboard_kpis(auth: Authorized, now: datetime) -> list[KpiOut]:
    db = auth.ctx.db
    currency = (await _institution(auth)).currency
    marks = int(await db.scalar(select(func.count()).select_from(AttendanceMark)) or 0)
    attended = int(
        await db.scalar(select(func.count()).where(AttendanceMark.status.in_(("present", "late", "remote")))) or 0
    )
    fees = select(FeeInvoice).where(FeeInvoice.currency == currency, FeeInvoice.status.not_in(("draft", "void")))
    collected = int(await db.scalar(select(func.coalesce(func.sum(fees.subquery().c.paid), 0))) or 0)
    owed = fees.where(_open_balance()).subquery()
    outstanding = int(await db.scalar(select(func.coalesce(func.sum(owed.c.total - owed.c.paid), 0))) or 0)
    admissions = await _count(auth, select(Application.id).where(Application.status.in_(OPEN_APPLICATIONS)))
    learners = await _count(auth, select(Learner.id).where(Learner.status.in_(("enrolled", "on_leave"))))
    as_of = now

    def metric(code: str, value: float, unit: str) -> KpiOut:
        return KpiOut.model_validate(
            {
                "code": code,
                "label_key": f"m28.kpi.{code}",
                "value": value,
                "unit": unit,
                "currency": currency if unit == "minor_units" else None,
                "trend": None,
                "as_of": as_of,
            }
        )

    return [
        metric("attendance", 0 if marks == 0 else attended / marks * 100, "percent"),
        metric("collected", collected, "minor_units"),
        metric("outstanding", outstanding, "minor_units"),
        metric("admissions", admissions, "count"),
        metric("learners", learners, "count"),
    ]


async def role_home(auth: Authorized) -> RoleHomeOut:
    db = auth.ctx.db
    now = datetime.now(UTC)
    person = auth.ctx.person_id
    profiles = (await db.execute(select(RoleProfile.id, RoleProfile.kind).where(RoleProfile.person_id == person))).all()
    if not profiles:
        raise ApiError(403, "forbidden", "You do not have permission to do this.")
    if auth.grants.has(DASHBOARDS_READ):
        kpis = await dashboard_kpis(auth, now)
        alerts = await _count(auth, select(LeaveRequest.id).where(LeaveRequest.status == "pending"))
        cards = [card("kpi", "M28", "/dashboards", len(kpis)), card("alerts", "M17", "/attendance/leave", alerts)]
        return RoleHomeOut(role="leader", person_id=person, learner_ids=[], cards=cards, generated_at=now)
    staff = [row.id for row in profiles if row.kind == "staff"]
    if staff:
        cards = await staff_cards(auth, staff, now)
        return RoleHomeOut(role="staff", person_id=person, learner_ids=[], cards=cards, generated_at=now)
    guardian = any(row.kind == "guardian" for row in profiles)
    if not guardian and not any(row.kind == "learner" for row in profiles):
        raise ApiError(403, "forbidden", "You do not have permission to do this.")
    people = await family_of(db, person) if guardian else {person}
    learner_ids = list(
        dict.fromkeys(await db.scalars(select(Learner.id).where(Learner.person_id.in_(people)).order_by(Learner.id)))
    )
    cards = await learner_cards(auth, learner_ids, now)
    return RoleHomeOut(
        role="family" if guardian else "learner",
        person_id=person,
        learner_ids=learner_ids[:10],
        cards=cards,
        generated_at=now,
    )
