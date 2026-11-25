"""SQLAlchemy mappings for the M09 import tables in revision 0030."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class ImportJob(Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        UniqueConstraint("id", "tenant_id", name="uq_import_jobs_ref_tenant"),
        CheckConstraint("template_version >= 1", name="template_version_valid"),
        CheckConstraint("(rollback_until IS NOT NULL) = (status = 'completed')", name="rollback_until_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    entity: Mapped[str] = mapped_column(String(16))
    file_name: Mapped[str] = mapped_column(String(200))
    source_format: Mapped[str] = mapped_column(String(8))
    template_version: Mapped[int] = mapped_column(Integer())
    status: Mapped[str] = mapped_column(String(16))
    total_rows: Mapped[int] = mapped_column(Integer())
    valid_rows: Mapped[int] = mapped_column(Integer())
    error_rows: Mapped[int] = mapped_column(Integer())
    created_by_staff_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    rollback_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class ColumnMapping(Base):
    __tablename__ = "column_mappings"
    __table_args__ = (ForeignKeyConstraint(["job_id", "tenant_id"], ["import_jobs.id", "import_jobs.tenant_id"]),)

    job_id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    columns: Mapped[list[dict[str, Any]]] = mapped_column(JSONB())


class ImportRowIssue(Base):
    __tablename__ = "import_row_issues"
    __table_args__ = (
        ForeignKeyConstraint(["job_id", "tenant_id"], ["import_jobs.id", "import_jobs.tenant_id"]),
        Index("ix_import_row_issues_job", "job_id", "row_number", "id"),
    )

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    job_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    row_number: Mapped[int] = mapped_column(Integer())
    column: Mapped[str | None] = mapped_column(String(120))
    severity: Mapped[str] = mapped_column(String(8))
    code: Mapped[str] = mapped_column(String(40))
    message_key: Mapped[str] = mapped_column(String(200))
