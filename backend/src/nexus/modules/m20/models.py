"""SQLAlchemy mappings for the M20 gradebook tables in revision 0035."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class GradebookRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


class GradingScheme(GradebookRow, Base):
    __tablename__ = "grading_schemes"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    bands: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Rubric(GradebookRow, Base):
    __tablename__ = "rubrics"
    __table_args__ = (UniqueConstraint("id", "tenant_id", name="uq_rubrics_ref_tenant"),)

    name: Mapped[str] = mapped_column(String(200))
    criteria: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())


class Assessment(GradebookRow, Base):
    __tablename__ = "assessments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        ForeignKeyConstraint(["rubric_id", "tenant_id"], ["rubrics.id", "rubrics.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_assessments_ref_tenant"),
    )

    subject_offering_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    max_marks: Mapped[Decimal] = mapped_column(Numeric(7, 1))
    weight_percent: Mapped[Decimal] = mapped_column(Numeric())
    rubric_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    due_on: Mapped[date | None] = mapped_column(Date())
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class MarkEntry(GradebookRow, Base):
    __tablename__ = "mark_entries"
    __table_args__ = (
        ForeignKeyConstraint(["assessment_id", "tenant_id"], ["assessments.id", "assessments.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(
            ["entered_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        UniqueConstraint("tenant_id", "assessment_id", "learner_id", name="uq_mark_entries_learner"),
    )

    assessment_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    marks: Mapped[Decimal | None] = mapped_column(Numeric(7, 1))
    absent: Mapped[bool] = mapped_column(Boolean())
    rubric_scores: Mapped[dict[str, int] | None] = mapped_column(JSONB(none_as_null=True))
    remark: Mapped[str | None] = mapped_column(Text())
    entered_by_staff_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    device_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
