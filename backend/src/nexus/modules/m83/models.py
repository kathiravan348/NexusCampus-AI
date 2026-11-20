"""M83 tables: key metadata only, never key material (`0007_vault_keys`); provider access (`0008_access_grants`)."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column


class VaultKey(Base):
    __tablename__ = "vault_keys"
    __table_args__ = (
        UniqueConstraint("tenant_id", "purpose"),
        CheckConstraint(
            "purpose IN ('tenant_data', 'field_health', 'field_identity', 'field_finance')", name="purpose_known"
        ),
        CheckConstraint("custody IN ('platform', 'byok', 'hyok')", name="custody_known"),
        CheckConstraint("status IN ('active', 'rotating', 'revoked', 'destroyed')", name="status_known"),
        CheckConstraint("rotated_at IS NULL OR rotated_at >= created_at", name="rotated_after_created"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    custody: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    vault_key_name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AccessRequest(Base):
    __tablename__ = "access_requests"
    __table_args__ = (
        CheckConstraint("cardinality(modules) >= 1", name="modules_not_empty"),
        CheckConstraint("mode IN ('read', 'edit')", name="mode_known"),
        CheckConstraint("duration_hours BETWEEN 1 AND 72", name="duration_bounded"),
        CheckConstraint("status IN ('pending', 'approved', 'denied', 'expired', 'revoked')", name="status_known"),
        CheckConstraint("(decided_at IS NULL) = (status = 'pending')", name="decided_at_when_decided"),
        CheckConstraint("(decided_by IS NULL) = (status = 'pending')", name="decided_by_when_decided"),
        CheckConstraint("decided_at IS NULL OR decided_at >= requested_at", name="decided_after_requested"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    staff_ref: Mapped[str] = mapped_column(String(ID_LENGTH))
    staff_display_name: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(String(2000))
    modules: Mapped[list[str]] = mapped_column(ARRAY(String(3)))
    mode: Mapped[str] = mapped_column(String(8))
    duration_hours: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class AccessGrant(Base):
    __tablename__ = "access_grants"
    __table_args__ = (
        CheckConstraint("cardinality(modules) >= 1", name="modules_not_empty"),
        CheckConstraint("mode IN ('read', 'edit')", name="mode_known"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        CheckConstraint("ends_at - starts_at <= interval '72 hours'", name="at_most_72_hours"),
        CheckConstraint(
            "revoked_at IS NULL OR (revoked_at >= starts_at AND revoked_at < ends_at)", name="revoked_in_window"
        ),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    request_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("access_requests.id"), unique=True)
    modules: Mapped[list[str]] = mapped_column(ARRAY(String(3)))
    mode: Mapped[str] = mapped_column(String(8))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BreakGlassNotice(Base):
    __tablename__ = "break_glass_notices"
    __table_args__ = (
        CheckConstraint("category IN ('legal_order', 'security_incident')", name="category_known"),
        CheckConstraint(
            "cardinality(approver_refs) = 2 AND approver_refs[1] <> approver_refs[2]", name="two_distinct_approvers"
        ),
        CheckConstraint("notified_at >= occurred_at", name="notified_after_occurred"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    approver_refs: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    report_url: Mapped[str | None] = mapped_column(String(2048))
