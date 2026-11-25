"""SQLAlchemy mappings for the M22 / M23 tables in revision 0037."""

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
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class RecordRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


class ReportCard(RecordRow, Base):
    __tablename__ = "report_cards"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
    )

    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    period_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    template_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    line_remarks: Mapped[str | None] = mapped_column(Text())
    overall_remark: Mapped[str | None] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(16))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class IssuedDocument(RecordRow, Base):
    __tablename__ = "issued_documents"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        UniqueConstraint("verification_code", name="uq_issued_documents_code"),
    )

    learner_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(16))
    number: Mapped[str] = mapped_column(String(40))
    template_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    issued_on: Mapped[date] = mapped_column(Date())
    signatures: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())
    verification_code: Mapped[str] = mapped_column(String(16))
    revoked: Mapped[bool] = mapped_column(Boolean())
    revoked_reason: Mapped[str | None] = mapped_column(Text())
