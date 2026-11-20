"""Domain event outbox (ARCHITECTURE §6, D25): `emit_event` stores the standard envelope (`event.ts`) in the
caller's transaction; workers (from NEX-056) publish it later, so an event exists if and only if its change
committed.
"""

import json
from datetime import UTC, datetime
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import ACTION, MODULE_ID
from nexus.core.hashchain import format_instant, normalize_instant
from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext


class DomainEvent(BaseModel):
    """The envelope as `frontend/packages/contracts/src/event.ts` (camelCase in JSON)."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)
    event_id: str = Field(alias="eventId", min_length=1, max_length=128)
    tenant_id: str = Field(alias="tenantId", min_length=1, max_length=128)
    module_id: str = Field(alias="moduleId", pattern=MODULE_ID.pattern)
    event_type: str = Field(alias="eventType", pattern=ACTION.pattern)
    occurred_at: str = Field(alias="occurredAt")
    actor_id: str | None = Field(alias="actorId", min_length=1, max_length=128)
    correlation_id: str = Field(alias="correlationId", min_length=1, max_length=128)
    schema_version: int = Field(alias="schemaVersion", ge=1)
    payload: dict[str, Any]

    @model_validator(mode="after")
    def _type_matches_module(self) -> Self:
        if not self.event_type.startswith(f"{self.module_id.lower()}."):
            raise ValueError("eventType must start with the emitting module, e.g. m02.")
        return self


async def emit_event(
    session: AsyncSession,
    ctx: TenantContext,
    *,
    event_type: str,
    actor_id: str | None,
    correlation_id: str,
    payload: dict[str, Any],
    schema_version: int = 1,
    occurred_at: datetime | None = None,
) -> DomainEvent:
    """Validates and stores one event for `ctx` in the current transaction."""
    when = normalize_instant(occurred_at or datetime.now(UTC))
    event = DomainEvent(
        event_id=new_id("evt"),
        tenant_id=ctx.tenant_id,
        module_id=event_type[:3].upper(),
        event_type=event_type,
        occurred_at=format_instant(when),
        actor_id=actor_id,
        correlation_id=correlation_id,
        schema_version=schema_version,
        payload=payload,
    )
    await session.execute(
        text(
            "INSERT INTO domain_events_outbox (event_id, tenant_id, module_id, event_type, occurred_at, "
            "actor_id, correlation_id, schema_version, payload) VALUES (:id, :t, :m, :type, :at, :actor, "
            ":corr, :ver, CAST(:payload AS jsonb))"
        ),
        {
            "id": event.event_id,
            "t": ctx.tenant_id,
            "m": event.module_id,
            "type": event_type,
            "at": when,
            "actor": actor_id,
            "corr": correlation_id,
            "ver": schema_version,
            "payload": json.dumps(payload),
        },
    )
    return event
