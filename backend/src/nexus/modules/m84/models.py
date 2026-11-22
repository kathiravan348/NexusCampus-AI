"""M84 table (`0017_install_status`): one install-wide row the install agent writes — versions and counts only."""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, SmallInteger, String, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import Base


class InstallStatusRow(Base):
    __tablename__ = "install_status"
    __table_args__ = (
        CheckConstraint("id = 1", name="install_status_single_row"),
        CheckConstraint(
            "NOT air_gapped OR (NOT telemetry_enabled AND last_update_check_at IS NULL)",
            name="install_status_air_gapped_is_offline",
        ),
    )
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, server_default="1")
    install_id: Mapped[str] = mapped_column(String(64))
    version: Mapped[str] = mapped_column(String(32))
    channel: Mapped[str] = mapped_column(String(8))
    licence: Mapped[dict[str, Any]] = mapped_column(JSONB)
    licence_problem: Mapped[str | None] = mapped_column(String(32))
    air_gapped: Mapped[bool] = mapped_column(Boolean)
    telemetry_enabled: Mapped[bool] = mapped_column(Boolean)
    last_update_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_backup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    update_offer: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class InstallBackupRow(Base):
    __tablename__ = "install_backups"
    __table_args__ = (
        CheckConstraint("kind IN ('backup', 'tenant_export')", name="install_backups_kind"),
        CheckConstraint("status IN ('running', 'done', 'failed')", name="install_backups_status"),
        CheckConstraint("encrypted", name="install_backups_always_encrypted"),
        CheckConstraint("(status = 'running') = (finished_at IS NULL)", name="install_backups_finished"),
        CheckConstraint("status <> 'done' OR size_bytes IS NOT NULL", name="install_backups_size_when_done"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(8))
    encrypted: Mapped[bool] = mapped_column(Boolean, server_default=true())
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_name: Mapped[str | None] = mapped_column(String(200))


class InstallDiagnosticRow(Base):
    __tablename__ = "install_diagnostics"
    __table_args__ = (
        CheckConstraint(
            "status IN ('generating', 'ready_for_review', 'approved', 'sent', 'discarded')",
            name="install_diagnostics_status",
        ),
        CheckConstraint("scrubbed", name="install_diagnostics_always_scrubbed"),
        CheckConstraint(
            "(status IN ('approved', 'sent')) <= (reviewed_by IS NOT NULL)", name="install_diagnostics_reviewer"
        ),
        CheckConstraint("(status = 'sent') = (sent_at IS NOT NULL)", name="install_diagnostics_sent_at"),
    )
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    status: Mapped[str] = mapped_column(String(24))
    scrubbed: Mapped[bool] = mapped_column(Boolean, server_default=true())
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    ticket_ref: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[str | None] = mapped_column(String(128))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_name: Mapped[str | None] = mapped_column(String(200))
