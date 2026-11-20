"""Domain event outbox (NEX-044): events commit with their change, or not at all."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.audit import AuditInput, record_audit
from nexus.core.events import DomainEvent, emit_event
from nexus.core.tenancy import TenantContext, bind_tenant
from tests.db.conftest import DbUrls

pytestmark = pytest.mark.anyio

AX = TenantContext("ten-ax")


@pytest.fixture
async def app(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def counts(app: async_sessionmaker[AsyncSession]) -> tuple[int, int]:
    async with app() as s, s.begin():
        await bind_tenant(s, AX)
        events = (await s.execute(text("SELECT count(*) FROM domain_events_outbox"))).scalar_one()
        audits = (await s.execute(text("SELECT count(*) FROM audit_events"))).scalar_one()
    return int(events), int(audits)


async def test_event_is_stored_in_the_contract_envelope(app: async_sessionmaker[AsyncSession]) -> None:
    async with app() as s, s.begin():
        await bind_tenant(s, AX)
        event = await emit_event(
            s,
            AX,
            event_type="m07.announcement.published",
            actor_id="usr-ax-karthik",
            correlation_id="req_123",
            payload={"title": "பொங்கல் விடுமுறை"},
        )
        row = (
            await s.execute(
                text("SELECT module_id, payload->>'title', published_at FROM domain_events_outbox WHERE event_id = :i"),
                {"i": event.event_id},
            )
        ).one()
    assert tuple(row) == ("M07", "பொங்கல் விடுமுறை", None)
    dumped = event.model_dump(by_alias=True)
    assert set(dumped) == {
        "eventId",
        "tenantId",
        "moduleId",
        "eventType",
        "occurredAt",
        "actorId",
        "correlationId",
        "schemaVersion",
        "payload",
    }


async def test_rollback_drops_the_change_its_audit_and_its_event(
    app: async_sessionmaker[AsyncSession],
) -> None:
    before = await counts(app)
    with pytest.raises(RuntimeError, match="boom"):
        async with app() as s, s.begin():
            await bind_tenant(s, AX)
            await record_audit(
                s, AX, AuditInput(action="m01.campus.updated", actor_kind="system", target_type="campus")
            )
            await emit_event(s, AX, event_type="m01.campus.updated", actor_id=None, correlation_id="c", payload={})
            raise RuntimeError("boom")
    assert await counts(app) == before


def test_event_type_must_start_with_its_module() -> None:
    with pytest.raises(ValueError, match="eventType"):
        DomainEvent(
            event_id="evt_1",
            tenant_id="ten-ax",
            module_id="M02",
            event_type="m07.announcement.published",
            occurred_at="2026-11-20T00:00:00Z",
            actor_id=None,
            correlation_id="c",
            schema_version=1,
            payload={},
        )
