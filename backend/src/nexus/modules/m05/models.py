"""M05 tables (migration `0012_plans_usage`); a test compares them with the migrated database."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

METRICS = "('learners', 'staff', 'storage_bytes', 'ai_credits', 'sms', 'email')"


class Plan(Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("ai_credits_per_month >= 0", name="credits_not_negative"),
        CheckConstraint("learner_limit IS NULL OR learner_limit >= 1", name="learner_limit_positive"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name_key: Mapped[str] = mapped_column(String(200))
    modules: Mapped[list[str]] = mapped_column(ARRAY(String(3)), server_default="{}")
    ai_credits_per_month: Mapped[int] = mapped_column(Integer)
    learner_limit: Mapped[int | None] = mapped_column(Integer)


class TenantPlan(Base):
    __tablename__ = "tenant_plans"
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    plan_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("plans.id"))


class UsageMeter(Base):
    __tablename__ = "usage_meters"
    __table_args__ = (
        CheckConstraint(f"metric IN {METRICS}", name="metric_known"),
        CheckConstraint("period_end > period_start", name="period_ordered"),
        CheckConstraint('used >= 0 AND ("limit" IS NULL OR "limit" >= 0)', name="counts_not_negative"),
    )
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    metric: Mapped[str] = mapped_column(String(32), primary_key=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[int] = mapped_column(BigInteger)
    limit: Mapped[int | None] = mapped_column(BigInteger)
