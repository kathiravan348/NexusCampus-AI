"""M03 tables (migration `0010_themes_fonts`); a test compares them with the migrated database."""

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

EMPTY = text("'{}'::jsonb")


class Theme(Base):
    __tablename__ = "themes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "scope_kind", "scope_target_id", name="one_layer_per_scope"),
        CheckConstraint("scope_kind IN ('platform', 'group', 'institution', 'campus')", name="scope_known"),
        CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'platform')", name="target_unless_platform"),
        CheckConstraint("density IS NULL OR density IN ('compact', 'comfortable', 'spacious')", name="density_known"),
        CheckConstraint("version >= 1", name="version_positive"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    scope_kind: Mapped[str] = mapped_column(String(16))
    scope_target_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    light: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=EMPTY)
    dark: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=EMPTY)
    fonts: Mapped[dict[str, Any]] = mapped_column(JSONB)
    radius: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=EMPTY)
    density: Mapped[str | None] = mapped_column(String(16))
    assets: Mapped[dict[str, Any]] = mapped_column(JSONB)
    locked_tokens: Mapped[list[str]] = mapped_column(ARRAY(String(64)), server_default="{}")
    version: Mapped[int] = mapped_column(Integer)
    updated_by: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Font(Base):
    __tablename__ = "fonts"
    __table_args__ = (
        CheckConstraint("source IN ('library', 'upload')", name="source_known"),
        CheckConstraint("(file_url IS NOT NULL) = (source = 'upload')", name="file_only_for_uploads"),
        CheckConstraint("(tenant_id IS NULL) = (source = 'library')", name="library_is_shared"),
        CheckConstraint("cardinality(roles) >= 1 AND cardinality(scripts) >= 1", name="roles_and_scripts"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str | None] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    family: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(16))
    roles: Mapped[list[str]] = mapped_column(ARRAY(String(8)))
    scripts: Mapped[list[str]] = mapped_column(ARRAY(String(16)))
    file_url: Mapped[str | None] = mapped_column(String(2048))
