"""Outbox worker + dispatch (NEX-056): Tamil template for a Tamil-default person, quiet hours, once per event,
retries with backoff."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.events import emit_event
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.modules.m07.channels import LogChannel, dev_channels
from nexus.modules.m07.dispatch import Event, dispatch, in_quiet_hours
from nexus.settings import Settings
from nexus.workers.outbox import backoff, notifications, process_tenant, run_once
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql

pytestmark = pytest.mark.anyio
AX = TenantContext("ten-ax")
CELL = Settings(environment="test", region="in")
ANNOUNCE = "m07.announcement.published"
VALUES = {"institution": "Apex Skills", "title": "Exam timetable"}


@pytest.fixture
async def sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def emit(sessions: async_sessionmaker[AsyncSession], recipients: list[str], **extra: object) -> str:
    async with sessions() as s, s.begin():
        await bind_tenant(s, AX)
        event = await emit_event(
            s,
            AX,
            event_type=ANNOUNCE,
            actor_id="usr-ax-karthik",
            correlation_id="corr-test",
            payload={"recipientPersonIds": recipients, "values": VALUES, **extra},
        )
    return event.event_id


def deliveries(owner_url: str, event_id: str) -> list[tuple[str, str, str, str | None, str]]:
    rows = owner_sql(
        owner_url,
        "SELECT d.recipient_person_id, d.channel, d.status, d.reason, t.locale FROM notification_deliveries d "
        "JOIN notification_templates t ON t.id = d.template_id WHERE d.event_id = :e ORDER BY 1, 2",
        {"e": event_id},
    )
    return [tuple(r) for r in rows]


async def channel_statuses(s: AsyncSession, event_id: str) -> dict[str, str]:
    rows = await s.execute(
        text("SELECT channel, status FROM notification_deliveries WHERE event_id = :e"), {"e": event_id}
    )
    return {str(c): str(st) for c, st in rows.all()}


async def test_tamil_default_person_gets_the_tamil_template(
    sessions: async_sessionmaker[AsyncSession], test_db: DbUrls
) -> None:
    sink = LogChannel()
    event_id = await emit(sessions, ["per-ax-meena", "per-ax-suresh"])
    published, failed = await process_tenant(sessions, CELL, "ten-ax", notifications(dev_channels(sink)))
    assert (published, failed) == (1, 0)
    assert deliveries(test_db.owner_url, event_id) == [
        ("per-ax-meena", "email", "sent", None, "ta-IN"),
        ("per-ax-meena", "in_app", "delivered", None, "ta-IN"),
        ("per-ax-suresh", "email", "sent", None, "en-IN"),  # preferred `en` finds the en-IN template
        ("per-ax-suresh", "in_app", "delivered", None, "en-IN"),
    ]
    meena = next(m for m in sink.sent if m.recipient_person_id == "per-ax-meena" and m.channel == "email")
    assert meena.subject == "புதிய அறிவிப்பு: Exam timetable" and "Apex Skills" in meena.body

    # The same event again (e.g. a crash before `published_at` was saved): nothing is sent twice.
    owner_sql(
        test_db.owner_url, "UPDATE domain_events_outbox SET published_at = NULL WHERE event_id = :e", {"e": event_id}
    )
    again = LogChannel()
    await process_tenant(sessions, CELL, "ten-ax", notifications(dev_channels(again)))
    assert again.sent == [] and len(deliveries(test_db.owner_url, event_id)) == 4


async def test_quiet_hours_suppress_unless_urgent(sessions: async_sessionmaker[AsyncSession]) -> None:
    late = datetime(2026, 11, 21, 18, 0, tzinfo=UTC)  # 23:30 in Kolkata, inside Lakshmi's 22:00-06:00
    async with sessions() as s, s.begin():
        await bind_tenant(s, AX)
        sink = LogChannel()
        quiet = Event(
            "evt-test-quiet", "ten-ax", ANNOUNCE, {"recipientPersonIds": ["per-ax-lakshmi"], "values": VALUES}
        )
        assert await dispatch(s, quiet, dev_channels(sink), now=late) == 2
        statuses = await channel_statuses(s, "evt-test-quiet")
        assert statuses == {"in_app": "suppressed", "email": "sent"}
        urgent = Event(
            "evt-test-urgent",
            "ten-ax",
            ANNOUNCE,
            {"recipientPersonIds": ["per-ax-lakshmi"], "values": VALUES, "urgent": True},
        )
        await dispatch(s, urgent, dev_channels(sink), now=late)
        statuses = await channel_statuses(s, "evt-test-urgent")
        assert statuses == {"in_app": "delivered", "email": "sent"}


async def test_failures_retry_with_backoff(sessions: async_sessionmaker[AsyncSession], test_db: DbUrls) -> None:
    event_id = await emit(sessions, ["per-ax-meena"])

    async def broken(session: AsyncSession, event: Event) -> int:
        raise RuntimeError("provider down")

    assert await run_once(sessions, CELL, broken) == 0
    row = owner_sql(
        test_db.owner_url,
        "SELECT attempts, next_attempt_at > now(), last_error, published_at FROM domain_events_outbox "
        "WHERE event_id = :e",
        {"e": event_id},
    )[0]
    assert row[0] == 1 and row[1] is True and row[2] == "RuntimeError: provider down" and row[3] is None
    assert await run_once(sessions, CELL, broken) == 0  # not due yet: untouched
    assert (
        owner_sql(test_db.owner_url, "SELECT attempts FROM domain_events_outbox WHERE event_id = :e", {"e": event_id})[
            0
        ][0]
        == 1
    )
    owner_sql(
        test_db.owner_url,
        "UPDATE domain_events_outbox SET next_attempt_at = now() WHERE event_id = :e",
        {"e": event_id},
    )
    assert await run_once(sessions, CELL, notifications(dev_channels())) >= 1


def test_quiet_window_and_backoff_rules() -> None:
    noon = datetime(2026, 11, 21, 6, 30, tzinfo=UTC)  # 12:00 in Kolkata
    assert not in_quiet_hours("22:00", "06:00", "Asia/Kolkata", noon)
    assert in_quiet_hours("11:00", "13:00", "Asia/Kolkata", noon)
    assert in_quiet_hours("21:00", "12:30", "Asia/Kolkata", noon)
    assert backoff(1) == timedelta(seconds=30) and backoff(3) == timedelta(seconds=120)
    assert backoff(20) == timedelta(hours=1)
