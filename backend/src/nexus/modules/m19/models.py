"""SQLAlchemy mappings for the M19 accounting tables in revision 0034."""

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
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class AccountingRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))


class LedgerAccount(AccountingRow, Base):
    __tablename__ = "ledger_accounts"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["parent_id", "tenant_id"], ["ledger_accounts.id", "ledger_accounts.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_ledger_accounts_ref_tenant"),
        UniqueConstraint("institution_id", "code", name="uq_ledger_accounts_code"),
    )

    code: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    parent_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    active: Mapped[bool] = mapped_column(Boolean())


class JournalEntry(AccountingRow, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
    )

    posted_on: Mapped[date] = mapped_column(Date())
    reference: Mapped[str] = mapped_column(String(60))
    currency: Mapped[str] = mapped_column(String(3))
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    source: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Budget(AccountingRow, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
    )

    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    currency: Mapped[str] = mapped_column(String(3))
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    status: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
