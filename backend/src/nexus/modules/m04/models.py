"""M04 tables (migration `0011_text_overrides`); a test compares them with the migrated database."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column


class TextOverride(Base):
    __tablename__ = "text_overrides"
    __table_args__ = (
        UniqueConstraint("tenant_id", "scope_kind", "scope_target_id", "locale", "key", name="one_per_scope_key"),
        CheckConstraint("scope_kind IN ('platform', 'group', 'institution', 'campus')", name="scope_known"),
        CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'platform')", name="target_unless_platform"),
        CheckConstraint("version >= 1", name="version_positive"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    scope_kind: Mapped[str] = mapped_column(String(16))
    scope_target_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    locale: Mapped[str] = mapped_column(String(35))
    key: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(String(5000))
    version: Mapped[int] = mapped_column(Integer)
    updated_by: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TextOverrideRevision(Base):
    __tablename__ = "text_override_revisions"
    __table_args__ = (CheckConstraint("version >= 1", name="version_positive"),)
    override_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("text_overrides.id"), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    message: Mapped[str | None] = mapped_column(String(5000))
    changed_by: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
