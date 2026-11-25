"""SQLAlchemy mappings for the M17 attendance tables in revision 0032."""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base

CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"


class AttendanceRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


class AttendanceSession(AttendanceRow, Base):
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        ForeignKeyConstraint(["timetable_slot_id", "tenant_id"], ["timetable_slots.id", "timetable_slots.tenant_id"]),
        ForeignKeyConstraint(
            ["taken_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        UniqueConstraint("id", "tenant_id", name="uq_attendance_sessions_ref_tenant"),
        CheckConstraint("(timetable_slot_id IS NOT NULL) = (mode = 'period')", name="slot_iff_period"),
        CheckConstraint("(submitted_at IS NOT NULL) = (status <> 'open')", name="submitted_iff_closed"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    mode: Mapped[str] = mapped_column(String(16))
    date: Mapped[date] = mapped_column(Date())
    class_group_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    timetable_slot_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    event_label: Mapped[str | None] = mapped_column(String(120))
    taken_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    status: Mapped[str] = mapped_column(String(16))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class AttendanceMark(AttendanceRow, Base):
    __tablename__ = "attendance_marks"
    __table_args__ = (
        ForeignKeyConstraint(["session_id", "tenant_id"], ["attendance_sessions.id", "attendance_sessions.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(
            ["marked_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        Index("ix_attendance_marks_session", "tenant_id", "session_id", "list_order"),
        CheckConstraint("(minutes_late IS NOT NULL) = (status = 'late')", name="late_iff_minutes"),
        CheckConstraint(f"note ~ {CIPHER}", name="note_encrypted"),
    )

    session_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    status: Mapped[str] = mapped_column(String(16))
    minutes_late: Mapped[int | None] = mapped_column(Integer())
    note: Mapped[str | None] = mapped_column(Text())
    method: Mapped[str] = mapped_column(String(16))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    marked_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    device_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class LeaveRequest(AttendanceRow, Base):
    __tablename__ = "leave_requests"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(["requested_by_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(
            ["decided_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        CheckConstraint('"to" >= "from"', name="dates_valid"),
        CheckConstraint(f"reason ~ {CIPHER}", name="reason_encrypted"),
    )

    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    requested_by_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    from_: Mapped[date] = mapped_column("from", Date())
    to: Mapped[date] = mapped_column(Date())
    reason: Mapped[str] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(16))
    decided_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
