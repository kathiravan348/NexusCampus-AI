"""SQLAlchemy mappings for the M86 rollover tables in revision 0039."""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class RolloverRun(Base):
    __tablename__ = "rollover_runs"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(
            ["from_academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        ForeignKeyConstraint(
            ["to_academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        UniqueConstraint("id", "tenant_id", name="uq_rollover_runs_ref_tenant"),
        Index(
            "uq_rollover_runs_open",
            "tenant_id",
            "institution_id",
            "from_academic_year_id",
            unique=True,
            postgresql_where=text("status IN ('draft','dry_run_ready','running')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    from_academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    to_academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    status: Mapped[str] = mapped_column(String(16))
    promote_count: Mapped[int] = mapped_column(Integer())
    detain_count: Mapped[int] = mapped_column(Integer())
    graduate_count: Mapped[int] = mapped_column(Integer())
    transfer_count: Mapped[int] = mapped_column(Integer())
    skip_count: Mapped[int] = mapped_column(Integer())
    carry_forward_fees: Mapped[bool] = mapped_column(Boolean())
    rollback_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_staff_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class PromotionDecision(Base):
    __tablename__ = "promotion_decisions"
    __table_args__ = (
        ForeignKeyConstraint(["run_id", "tenant_id"], ["rollover_runs.id", "rollover_runs.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(["to_class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        ForeignKeyConstraint(
            ["overridden_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        UniqueConstraint("tenant_id", "run_id", "learner_id", name="uq_promotion_decisions_learner"),
    )

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())
    run_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    action: Mapped[str] = mapped_column(String(16))
    to_class_group_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    reason_key: Mapped[str | None] = mapped_column(String(200))
    overridden_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    # Internal state for an exact roll-back (never returned).
    previous_enrolment_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    new_enrolment_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    previous_learner_status: Mapped[str | None] = mapped_column(String(16))
    previous_left_on: Mapped[date | None] = mapped_column(Date())
