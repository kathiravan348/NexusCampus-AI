"""SQLAlchemy mappings for the M16 timetable tables in revision 0031."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base
from nexus.modules.m15.models import SubjectOffering

Index("uq_m16_subject_offering_ref", SubjectOffering.id, SubjectOffering.tenant_id, unique=True)


class TimetableRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Room(TimetableRow, Base):
    __tablename__ = "rooms"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_rooms_ref_tenant"),
        CheckConstraint("capacity BETWEEN 1 AND 5000", name="capacity_valid"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    campus_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    capacity: Mapped[int | None] = mapped_column(Integer())
    active: Mapped[bool] = mapped_column(Boolean())


class BellSchedule(TimetableRow, Base):
    __tablename__ = "bell_schedules"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_bell_schedules_ref_tenant"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    periods: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())


class TimetableSlot(TimetableRow, Base):
    __tablename__ = "timetable_slots"
    __table_args__ = (
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        ForeignKeyConstraint(["room_id", "tenant_id"], ["rooms.id", "rooms.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_timetable_slots_ref_tenant"),
        Index("ix_timetable_slots_week", "tenant_id", "weekday"),
        CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_valid"),
    )

    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    period_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    subject_offering_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    weekday: Mapped[int] = mapped_column(SmallInteger())
    start: Mapped[str] = mapped_column(String(5))
    end: Mapped[str] = mapped_column(String(5))
    room_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    staff_profile_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    effective_from: Mapped[date] = mapped_column(Date())
    effective_to: Mapped[date | None] = mapped_column(Date())
