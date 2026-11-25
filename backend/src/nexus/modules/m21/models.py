"""SQLAlchemy mappings for the M21 exam tables in revision 0036."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class ExamRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


class Exam(ExamRow, Base):
    __tablename__ = "exams"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        UniqueConstraint("id", "tenant_id", name="uq_exams_ref_tenant"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    starts_on: Mapped[date] = mapped_column(Date())
    ends_on: Mapped[date] = mapped_column(Date())
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class ExamPaper(ExamRow, Base):
    __tablename__ = "exam_papers"
    __table_args__ = (
        ForeignKeyConstraint(["exam_id", "tenant_id"], ["exams.id", "exams.tenant_id"]),
        ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        UniqueConstraint("id", "tenant_id", name="uq_exam_papers_ref_tenant"),
    )

    exam_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    subject_offering_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    date: Mapped[date] = mapped_column(Date())
    start: Mapped[str] = mapped_column(String(5))
    end: Mapped[str] = mapped_column(String(5))
    room_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    max_marks: Mapped[Decimal] = mapped_column(Numeric(7, 1))


class SeatAssignment(ExamRow, Base):
    __tablename__ = "seat_assignments"
    __table_args__ = (
        ForeignKeyConstraint(["exam_paper_id", "tenant_id"], ["exam_papers.id", "exam_papers.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(["room_id", "tenant_id"], ["rooms.id", "rooms.tenant_id"]),
        UniqueConstraint("tenant_id", "exam_paper_id", "learner_id", name="uq_seat_assignments_learner"),
        UniqueConstraint("tenant_id", "exam_paper_id", "room_id", "seat_label", name="uq_seat_assignments_seat"),
    )

    exam_paper_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    room_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    seat_label: Mapped[str] = mapped_column(String(10))


class HallTicket(ExamRow, Base):
    __tablename__ = "hall_tickets"
    __table_args__ = (
        ForeignKeyConstraint(["exam_id", "tenant_id"], ["exams.id", "exams.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        UniqueConstraint("tenant_id", "ticket_number", name="uq_hall_tickets_number"),
    )

    exam_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    ticket_number: Mapped[str] = mapped_column(String(40))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean())


class RevaluationRequest(ExamRow, Base):
    __tablename__ = "revaluation_requests"
    __table_args__ = (
        ForeignKeyConstraint(["exam_paper_id", "tenant_id"], ["exam_papers.id", "exam_papers.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
    )

    exam_paper_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    reason: Mapped[str] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(16))
    old_marks: Mapped[Decimal] = mapped_column(Numeric(7, 1))
    new_marks: Mapped[Decimal | None] = mapped_column(Numeric(7, 1))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
