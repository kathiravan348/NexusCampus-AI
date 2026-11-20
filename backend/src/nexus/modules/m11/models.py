"""M11 tables (migration `0015_ai`); a test compares them with the migrated database."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import UserDefinedType

from nexus.core.models import ID_LENGTH, Base, id_column

DIMS = 1024
TIERS = "('fast', 'balanced', 'reasoning', 'embedding', 'multimodal')"


class Vector(UserDefinedType[list[float]]):
    """pgvector `vector(n)` (D47); values are written as `'[x, y, …]'` text and cast in SQL."""

    cache_ok = True

    def __init__(self, dims: int) -> None:
        self.dims = dims

    def get_col_spec(self, **_: Any) -> str:
        return f"vector({self.dims})"


class AiSettings(Base):
    __tablename__ = "ai_settings"
    __table_args__ = (
        CheckConstraint(f"default_tier IN {TIERS}", name="tier_known"),
        CheckConstraint("provider_kind IN ('cloud', 'local')", name="provider_kind_known"),
        CheckConstraint("blocked_modules @> ARRAY['M61', 'M83']::varchar[]", name="health_and_vault_blocked"),
    )
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean)
    modules: Mapped[dict[str, Any]] = mapped_column(JSONB)
    blocked_modules: Mapped[list[str]] = mapped_column(ARRAY(String(3)))
    safeguarding_enabled: Mapped[bool] = mapped_column(Boolean)
    default_tier: Mapped[str] = mapped_column(String(16))
    provider_kind: Mapped[str] = mapped_column(String(8))
    provider_label: Mapped[str] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AiCredit(Base):
    __tablename__ = "ai_credits"
    __table_args__ = (
        CheckConstraint("period_end > period_start", name="period_ordered"),
        CheckConstraint("granted >= 0 AND used >= 0", name="counts_not_negative"),
        CheckConstraint("NOT hard_cap OR used <= granted", name="hard_cap_holds"),
    )
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    granted: Mapped[int] = mapped_column(Integer)
    used: Mapped[int] = mapped_column(Integer)
    hard_cap: Mapped[bool] = mapped_column(Boolean)


class AiAnswerLog(Base):
    __tablename__ = "ai_answer_log"
    __table_args__ = (CheckConstraint("outcome IN ('answered', 'no_source', 'refused')", name="outcome_known"),)
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    locale: Mapped[str] = mapped_column(String(35))
    tier: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(120))
    outcome: Mapped[str] = mapped_column(String(16))
    source_count: Mapped[int] = mapped_column(Integer)
    credits_used: Mapped[int] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AiChunk(Base):
    __tablename__ = "ai_chunks"
    __table_args__ = (
        UniqueConstraint("tenant_id", "module_id", "record_type", "record_id", "locale", name="one_chunk_per_record"),
        CheckConstraint("module_id NOT IN ('M61', 'M83')", name="never_health_or_vault"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    module_id: Mapped[str] = mapped_column(String(3))
    record_type: Mapped[str] = mapped_column(String(64))
    record_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    label: Mapped[str] = mapped_column(String(200))
    locale: Mapped[str] = mapped_column(String(35))
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(DIMS))
