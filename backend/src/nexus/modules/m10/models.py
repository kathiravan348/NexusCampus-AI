"""M10 tables (migration `0014_sync`); a test compares them with the migrated database."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint("platform IN ('web', 'android', 'ios', 'edge')", name="platform_known"),
        CheckConstraint("status IN ('active', 'revoke_pending', 'revoked')", name="status_known"),
        CheckConstraint("(revoked_at IS NULL) = (status <> 'revoked')", name="revoked_at_when_revoked"),
        CheckConstraint(
            "pending_count >= 0 AND conflict_count >= 0 AND lost_write_count >= 0", name="counts_not_negative"
        ),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(200))
    platform: Mapped[str] = mapped_column(String(16))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_count: Mapped[int] = mapped_column(Integer, server_default="0")
    conflict_count: Mapped[int] = mapped_column(Integer, server_default="0")
    lost_write_count: Mapped[int] = mapped_column(Integer, server_default="0")
    status: Mapped[str] = mapped_column(String(16))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SyncConflict(Base):
    __tablename__ = "sync_conflicts"
    __table_args__ = (
        CheckConstraint("merge_rule IN ('lww-audited', 'append-only', 'manual-review-only')", name="merge_rule_known"),
        CheckConstraint("status IN ('open', 'resolved')", name="status_known"),
        CheckConstraint(
            "resolution IS NULL OR resolution IN ('keep_server', 'keep_client', 'merged')", name="resolution_known"
        ),
        CheckConstraint("(resolution IS NULL) = (status = 'open')", name="resolution_when_resolved"),
        CheckConstraint("(resolved_at IS NULL) = (status = 'open')", name="resolved_at_when_resolved"),
        CheckConstraint("resolved_at IS NULL OR resolved_at >= created_at", name="resolved_after_created"),
        CheckConstraint("client_version >= 0 AND server_version >= 0", name="versions_not_negative"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("devices.id"), index=True)
    module_id: Mapped[str] = mapped_column(String(3))
    operation: Mapped[str] = mapped_column(String(120))
    merge_rule: Mapped[str] = mapped_column(String(32))
    summary_key: Mapped[str] = mapped_column(String(200))
    client_version: Mapped[int] = mapped_column(Integer)
    server_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    resolution: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
