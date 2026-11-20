"""Tables of the audit core (migration `0002_audit_outbox`): `audit_events`, `audit_chain_heads`,
`domain_events_outbox`. Written through `core/audit.py` and `core/events.py` only.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

HASH = 64


class AuditEventRow(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "seq"),
        CheckConstraint("seq >= 1", name="seq_positive"),
        CheckConstraint("(grant_id IS NOT NULL) = (actor_kind = 'provider_grant')", name="grant_iff_provider"),
        CheckConstraint("(actor_id IS NULL) = (actor_kind = 'system')", name="actor_iff_not_system"),
        CheckConstraint("actor_kind IN ('user', 'system', 'provider_grant')", name="actor_kind_known"),
        CheckConstraint("action LIKE lower(module_id) || '.%'", name="action_starts_with_module"),
        CheckConstraint("hash ~ '^[0-9a-f]{64}$'", name="hash_hex"),
        CheckConstraint("prev_hash IS NULL OR prev_hash ~ '^[0-9a-f]{64}$'", name="prev_hash_hex"),
        CheckConstraint("(seq = 1) = (prev_hash IS NULL)", name="only_first_has_no_prev"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"))
    seq: Mapped[int] = mapped_column(BigInteger)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_kind: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    grant_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    action: Mapped[str] = mapped_column(String(120))
    module_id: Mapped[str] = mapped_column(String(3))
    target_type: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    device_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    #: `[{field, sensitive}]` — field names only, never values.
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    prev_hash: Mapped[str | None] = mapped_column(String(HASH))
    hash: Mapped[str] = mapped_column(String(HASH))


class AuditChainHead(Base):
    """Last link of each tenant's chain; locked `FOR UPDATE` by every writer."""

    __tablename__ = "audit_chain_heads"
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    last_seq: Mapped[int] = mapped_column(BigInteger)
    last_hash: Mapped[str | None] = mapped_column(String(HASH))


class DomainEventOutboxRow(Base):
    __tablename__ = "domain_events_outbox"
    __table_args__ = (
        CheckConstraint("event_type LIKE lower(module_id) || '.%'", name="type_starts_with_module"),
        CheckConstraint("schema_version >= 1", name="schema_version_positive"),
    )
    event_id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    module_id: Mapped[str] = mapped_column(String(3))
    event_type: Mapped[str] = mapped_column(String(120))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    correlation_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    schema_version: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    #: Set by the worker once delivered (NEX-056); unpublished rows have NULL.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
