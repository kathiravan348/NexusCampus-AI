"""M06 tables (migration `0009_privacy`). Columns mirror `frontend/packages/contracts/src/compliance.ts`; a test
compares these models with the migrated database."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

PACKS = "('gdpr', 'uk_gdpr', 'ferpa', 'coppa', 'dpdp', 'lgpd', 'popia', 'pdpa', 'eu_ai_act')"


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('ai_features', 'media_sharing', 'marketing', 'data_processing')", name="purpose_known"
        ),
        CheckConstraint("status IN ('granted', 'withdrawn', 'pending')", name="status_known"),
        CheckConstraint("method IN ('form', 'digital_signature', 'in_app', 'paper')", name="method_known"),
        CheckConstraint("(withdrawn_at IS NULL) = (status <> 'withdrawn')", name="withdrawn_at_when_withdrawn"),
        CheckConstraint("withdrawn_at IS NULL OR withdrawn_at >= recorded_at", name="withdrawn_after_recorded"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    person_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("people.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    given_by_person_id: Mapped[str | None] = mapped_column(String(ID_LENGTH), ForeignKey("people.id"))
    method: Mapped[str] = mapped_column(String(32))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataSubjectRequest(Base):
    __tablename__ = "data_subject_requests"
    __table_args__ = (
        CheckConstraint("kind IN ('access', 'correct', 'delete', 'export')", name="kind_known"),
        CheckConstraint("status IN ('received', 'in_progress', 'completed', 'rejected')", name="status_known"),
        CheckConstraint("due_at > received_at", name="due_after_received"),
        CheckConstraint(
            "(completed_at IS NULL) = (status IN ('received', 'in_progress'))", name="completed_at_when_closed"
        ),
        CheckConstraint("completed_at IS NULL OR completed_at >= received_at", name="completed_after_received"),
        CheckConstraint("rejection_reason IS NULL OR status = 'rejected'", name="reason_only_when_rejected"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    person_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("people.id"))
    kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[str | None] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    rejection_reason: Mapped[str | None] = mapped_column(String(500))


class TenantCompliance(Base):
    __tablename__ = "tenant_compliance"
    __table_args__ = (CheckConstraint(f"pack_code IN {PACKS}", name="pack_known"),)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    pack_code: Mapped[str] = mapped_column(String(16), primary_key=True)
