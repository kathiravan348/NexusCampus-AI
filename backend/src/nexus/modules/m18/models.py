"""SQLAlchemy mappings for the M18 fee tables in revision 0033."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class FeeRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


def _now() -> Any:
    return mapped_column(DateTime(timezone=True), server_default=text("now()"))


class FeeHead(FeeRow, Base):
    __tablename__ = "fee_heads"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_fee_heads_ref_tenant"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    tax_rate_basis_points: Mapped[int] = mapped_column(Integer())
    refundable: Mapped[bool] = mapped_column(Boolean())
    active: Mapped[bool] = mapped_column(Boolean())


class FeePlan(FeeRow, Base):
    __tablename__ = "fee_plans"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        UniqueConstraint("id", "tenant_id", name="uq_fee_plans_ref_tenant"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    year_level_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    currency: Mapped[str] = mapped_column(String(3))
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    instalments: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class Concession(FeeRow, Base):
    __tablename__ = "concessions"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(["fee_plan_id", "tenant_id"], ["fee_plans.id", "fee_plans.tenant_id"]),
        ForeignKeyConstraint(
            ["approved_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
    )

    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    fee_plan_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(16))
    mode: Mapped[str] = mapped_column(String(8))
    value: Mapped[int] = mapped_column(BigInteger())
    reason: Mapped[str] = mapped_column(Text())
    approved_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    valid_from: Mapped[date] = mapped_column(Date())
    valid_to: Mapped[date | None] = mapped_column(Date())
    created_at: Mapped[datetime] = _now()


class FeeInvoice(FeeRow, Base):
    __tablename__ = "fee_invoices"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_fee_invoices_ref_tenant"),
        UniqueConstraint("tenant_id", "invoice_number", name="uq_fee_invoices_number"),
    )

    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    invoice_number: Mapped[str] = mapped_column(String(40))
    currency: Mapped[str] = mapped_column(String(3))
    issued_on: Mapped[date] = mapped_column(Date())
    due_on: Mapped[date] = mapped_column(Date())
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    total: Mapped[int] = mapped_column(BigInteger())
    paid: Mapped[int] = mapped_column(BigInteger())
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class FeePayment(FeeRow, Base):
    __tablename__ = "fee_payments"
    __table_args__ = (
        ForeignKeyConstraint(["payer_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_fee_payments_ref_tenant"),
        UniqueConstraint("tenant_id", "receipt_number", name="uq_fee_payments_receipt"),
    )

    invoice_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    payer_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[int] = mapped_column(BigInteger())
    method: Mapped[str] = mapped_column(String(16))
    gateway_reference: Mapped[str | None] = mapped_column(String(120))
    receipt_number: Mapped[str] = mapped_column(String(40))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class FeeRefund(FeeRow, Base):
    __tablename__ = "fee_refunds"
    __table_args__ = (
        ForeignKeyConstraint(["payment_id", "tenant_id"], ["fee_payments.id", "fee_payments.tenant_id"]),
        ForeignKeyConstraint(
            ["decided_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
    )

    payment_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    amount: Mapped[int] = mapped_column(BigInteger())
    reason: Mapped[str] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(16))
    decided_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()
