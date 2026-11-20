"""M83 tables (migration `0007_vault_keys`): key metadata only, never key material."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, func
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
