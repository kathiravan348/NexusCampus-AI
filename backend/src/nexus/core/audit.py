"""Audit writer (M06 core, ARCHITECTURE §6, V-3): `record_audit` appends one event to the tenant's hash
chain in the caller's transaction, so the change and its audit commit or roll back together.

Only the **names** of changed fields are recorded, never values. Inside a provider grant request
(`TenantContext.provider`), every event is recorded as `actorKind = provider_grant` with the grant's id.
The tenant's chain head is locked `FOR UPDATE`, so concurrent writers queue up and the chain never forks.
"""

import json
import re
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.hashchain import audit_hash, format_instant, normalize_instant
from nexus.core.ids import new_id
from nexus.core.tenancy import TENANT_SETTING, TenantContext

ActorKind = Literal["user", "system", "provider_grant"]
ACTION = re.compile(r"^[mp]\d{2}(\.[a-z][a-zA-Z0-9]*){2,}$")
MODULE_ID = re.compile(r"^[MP](0[1-9]|[1-9]\d)$")


class AuditChange(BaseModel):
    """A changed field, by name only (contract `AuditEvent.changes[]`)."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    field: str = Field(pattern=r"^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$")
    sensitive: bool = False


class AuditInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    action: str = Field(pattern=ACTION.pattern)
    actor_kind: ActorKind
    actor_id: str | None = Field(default=None, min_length=1, max_length=128)
    grant_id: str | None = Field(default=None, min_length=1, max_length=128)
    target_type: str = Field(pattern=r"^[a-z][a-zA-Z0-9]*$")
    target_id: str | None = Field(default=None, min_length=1, max_length=128)
    device_id: str | None = Field(default=None, min_length=1, max_length=128)
    changes: tuple[AuditChange, ...] = ()

    @model_validator(mode="after")
    def _contract_rules(self) -> Self:
        if (self.grant_id is not None) != (self.actor_kind == "provider_grant"):
            raise ValueError("grant_id is required for provider_grant actors and must be None otherwise")
        if (self.actor_id is None) != (self.actor_kind == "system"):
            raise ValueError("actor_id must be None for system events and set otherwise")
        return self

    @property
    def module_id(self) -> str:
        return self.action[:3].upper()


class AuditRecord(BaseModel):
    """What was written, in contract shape (camelCase via `model_dump(by_alias=True)`)."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)
    id: str
    tenant_id: str = Field(alias="tenantId")
    seq: int
    occurred_at: str = Field(alias="occurredAt")
    action: str
    prev_hash: str | None = Field(alias="prevHash")
    hash: str


async def _require_context(session: AsyncSession, ctx: TenantContext) -> None:
    bound = (
        await session.execute(text("SELECT current_setting(:n, true)"), {"n": TENANT_SETTING})
    ).scalar_one_or_none()
    if bound != ctx.tenant_id:
        raise RuntimeError("record_audit must run inside the same tenant's transaction (tenant_transaction)")


async def record_audit(
    session: AsyncSession,
    ctx: TenantContext,
    event: AuditInput,
    *,
    occurred_at: datetime | None = None,
) -> AuditRecord:
    """Appends `event` to `ctx`'s chain inside the current transaction and returns the stored record."""
    await _require_context(session, ctx)
    if ctx.provider is not None:
        # Work done on a provider grant is always attributed to the grant, whatever the module wrote (V-3).
        event = event.model_copy(
            update={
                "actor_kind": "provider_grant",
                "actor_id": ctx.provider.staff_ref,
                "grant_id": ctx.provider.grant_id,
            }
        )
    when = normalize_instant(occurred_at or datetime.now(UTC))
    await session.execute(
        text(
            "INSERT INTO audit_chain_heads (tenant_id, last_seq, last_hash) VALUES (:t, 0, NULL) "
            "ON CONFLICT (tenant_id) DO NOTHING"
        ),
        {"t": ctx.tenant_id},
    )
    last_seq, last_hash = (
        await session.execute(
            text("SELECT last_seq, last_hash FROM audit_chain_heads WHERE tenant_id = :t FOR UPDATE"),
            {"t": ctx.tenant_id},
        )
    ).one()
    event_id = new_id("aud")
    seq = int(last_seq) + 1
    digest = audit_hash(event_id, when, event.action, last_hash)
    await session.execute(
        text(
            "INSERT INTO audit_events (id, tenant_id, seq, occurred_at, actor_kind, actor_id, grant_id, "
            "action, module_id, target_type, target_id, device_id, changes, prev_hash, hash) VALUES "
            "(:id, :t, :seq, :at, :ak, :aid, :gid, :action, :mid, :tt, :tid, :did, CAST(:changes AS jsonb), "
            ":prev, :hash)"
        ),
        {
            "id": event_id,
            "t": ctx.tenant_id,
            "seq": seq,
            "at": when,
            "ak": event.actor_kind,
            "aid": event.actor_id,
            "gid": event.grant_id,
            "action": event.action,
            "mid": event.module_id,
            "tt": event.target_type,
            "tid": event.target_id,
            "did": event.device_id,
            "changes": json.dumps([c.model_dump() for c in event.changes]),
            "prev": last_hash,
            "hash": digest,
        },
    )
    await session.execute(
        text("UPDATE audit_chain_heads SET last_seq = :seq, last_hash = :hash WHERE tenant_id = :t"),
        {"seq": seq, "hash": digest, "t": ctx.tenant_id},
    )
    return AuditRecord(
        id=event_id,
        tenant_id=ctx.tenant_id,
        seq=seq,
        occurred_at=format_instant(when),
        action=event.action,
        prev_hash=last_hash,
        hash=digest,
    )


def changes(*fields: str, sensitive: Sequence[str] = ()) -> tuple[AuditChange, ...]:
    """`changes("locale.timeZone", "person.phone", sensitive=["person.phone"])`."""
    return tuple(AuditChange(field=f, sensitive=f in sensitive) for f in fields)
