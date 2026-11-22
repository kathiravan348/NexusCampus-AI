"""M84 table (`0017_install_status`): one install-wide row the install agent writes — versions and counts only."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, SmallInteger, String
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
