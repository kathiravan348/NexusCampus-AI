"""Outbox worker (NEX-056, ARCHITECTURE §6): publishes committed domain events to their consumers (Stage 1:
notifications). Run it with `nexus-worker` (`--once` processes what is due and exits).

It runs as `nexus_app` under Row-Level Security: `nexus_outbox_tenants()` names the tenants with due events, then
each tenant is processed in its own tenant transaction. Rows are claimed `FOR UPDATE SKIP LOCKED`, so several
workers never take the same event. Each event runs in a savepoint: success sets `published_at`; a failure counts an
attempt and schedules a retry with exponential backoff (30 s · 2^n, capped at 1 h); after `MAX_ATTEMPTS` the event
is parked (`next_attempt_at` far ahead) with its last error for an operator.

Once a UTC day the worker also signs every tenant's audit chain head (`core/checkpoints.py`, NEX-065).
"""

import argparse
import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import httpx2
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core import db
from nexus.core.checkpoints import checkpoint_all
from nexus.core.errors import ApiError
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.modules.m07.channels import Channel, dev_channels
from nexus.modules.m07.dispatch import Event, dispatch
from nexus.settings import Settings, get_settings

log = logging.getLogger("nexus.worker")
BATCH = 50
MAX_ATTEMPTS = 8
PARKED = timedelta(days=3650)
Handler = Callable[[AsyncSession, Event], Awaitable[int]]


def backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(30 * 2 ** max(attempts - 1, 0), 3600))


def notifications(channels: dict[str, Channel]) -> Handler:
    async def handle(session: AsyncSession, event: Event) -> int:
        return await dispatch(session, event, channels)

    return handle


async def process_tenant(
    sessions: async_sessionmaker[AsyncSession], settings: Settings, tenant_id: str, handler: Handler
) -> tuple[int, int]:
    """Publishes this tenant's due events; returns `(published, failed)`."""
    published = failed = 0
    async with tenant_transaction(sessions, TenantContext(tenant_id), settings, write=True) as session:
        rows = await session.execute(
            text(
                "SELECT event_id, event_type, payload, attempts FROM domain_events_outbox WHERE published_at IS NULL "
                "AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY occurred_at, event_id "
                "LIMIT :n FOR UPDATE SKIP LOCKED"
            ),
            {"n": BATCH},
        )
        for row in rows.mappings().all():
            event = Event(row["event_id"], tenant_id, row["event_type"], dict(row["payload"]))
            try:
                async with session.begin_nested():
                    await handler(session, event)
                await session.execute(
                    text("UPDATE domain_events_outbox SET published_at = now(), last_error = NULL WHERE event_id = :e"),
                    {"e": event.event_id},
                )
                published += 1
            except Exception as exc:  # one bad event must not stop the others
                attempts = int(row["attempts"]) + 1
                delay = PARKED if attempts >= MAX_ATTEMPTS else backoff(attempts)
                log.warning("event %s failed (attempt %d): %s", event.event_id, attempts, type(exc).__name__)
                await session.execute(
                    text(
                        "UPDATE domain_events_outbox SET attempts = :a, next_attempt_at = :next, last_error = :err "
                        "WHERE event_id = :e"
                    ),
                    {
                        "a": attempts,
                        "next": datetime.now(UTC) + delay,
                        "err": f"{type(exc).__name__}: {exc}"[:500],
                        "e": event.event_id,
                    },
                )
                failed += 1
    return published, failed


async def run_once(sessions: async_sessionmaker[AsyncSession], settings: Settings, handler: Handler) -> int:
    """One pass over every tenant with due events; returns the number published."""
    async with sessions() as session:
        tenants = list((await session.execute(text("SELECT * FROM nexus_outbox_tenants()"))).scalars())
    total = 0
    for tenant_id in tenants:
        try:
            published, _ = await process_tenant(sessions, settings, tenant_id, handler)
        except ApiError as exc:
            log.info("tenant %s skipped (%s)", tenant_id, exc.code)
            continue
        except Exception:  # e.g. a tenant of another region: skipped, logged by the region check
            log.exception("tenant %s skipped", tenant_id)
            continue
        total += published
    return total


async def _main(once: bool, interval: float) -> None:
    settings = get_settings()
    db.init_engine(settings)
    handler = notifications(dev_channels())
    signed_day = None
    async with httpx2.AsyncClient(timeout=10.0) as http:
        vault = HttpVault(settings, http)
        try:
            while True:
                published = await run_once(db.sessionmaker(), settings, handler)
                if published:
                    log.info("published %d events", published)
                today = datetime.now(UTC).date()
                if today != signed_day:
                    try:
                        signed, refused = await checkpoint_all(db.sessionmaker(), settings, vault, today)
                        log.info("audit checkpoints for %s: %d signed, %d refused", today, signed, refused)
                        signed_day = today
                    except Exception:  # Vault down: the outbox keeps running, the next pass retries
                        log.exception("audit checkpoints failed")
                if once:
                    return
                await asyncio.sleep(interval)
        finally:
            await db.dispose_engine()


def main() -> None:
    utf8_console()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Publish outbox events (notifications).")
    parser.add_argument("--once", action="store_true", help="process what is due, then exit")
    parser.add_argument("--interval", type=float, default=2.0, help="seconds between passes")
    args = parser.parse_args()
    # psycopg async needs the selector loop (the Windows default, Proactor, is not supported).
    asyncio.run(_main(args.once, args.interval), loop_factory=asyncio.SelectorEventLoop)
