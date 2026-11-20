"""Audit core (NEX-044): one unbroken chain per tenant under concurrency, tamper detection, append-only."""

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.hashchain import verify_chain
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.seed.demo import load_fixtures
from tests.db.conftest import DbUrls

pytestmark = pytest.mark.anyio

LS = TenantContext("ten-ls")
INVITED = AuditInput(action="m02.user.invited", actor_kind="user", actor_id="usr-ls-priya", target_type="user")


@pytest.fixture
async def app(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.app_url, pool_size=12)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def owner(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.owner_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def write(sessions: async_sessionmaker[AsyncSession], event: AuditInput = INVITED) -> None:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        await record_audit(s, LS, event)


async def check(sessions: async_sessionmaker[AsyncSession], ctx: TenantContext = LS) -> tuple[bool, int]:
    async with sessions() as s, s.begin():
        await bind_tenant(s, ctx)
        result = await verify_chain(s, ctx.tenant_id)
    return result.ok, result.checked


async def test_seeded_mock_hashes_verify_with_the_backend_hash(app: async_sessionmaker[AsyncSession]) -> None:
    fixtures = load_fixtures()
    for tenant in fixtures["tenants"]:
        expected = sum(1 for e in fixtures["auditEvents"] if e["tenantId"] == tenant["id"])
        assert await check(app, TenantContext(tenant["id"])) == (True, expected), tenant["id"]


async def test_new_events_continue_the_seeded_chain(app: async_sessionmaker[AsyncSession]) -> None:
    _, before = await check(app)
    async with app() as s, s.begin():
        await bind_tenant(s, LS)
        head = (await s.execute(text("SELECT last_hash FROM audit_chain_heads"))).scalar_one()
        record = await record_audit(
            s,
            LS,
            AuditInput(
                action="m01.institution.updated",
                actor_kind="user",
                actor_id="usr-ls-priya",
                target_type="institution",
                target_id="ins-ls",
                changes=changes("locale.timeZone"),
            ),
            occurred_at=datetime(2026, 11, 20, 9, 30, tzinfo=UTC),
        )
    assert record.prev_hash == head and record.occurred_at == "2026-11-20T09:30:00Z"
    assert await check(app) == (True, before + 1)


async def test_ten_concurrent_writers_keep_one_unbroken_chain(app: async_sessionmaker[AsyncSession]) -> None:
    _, before = await check(app)
    await asyncio.gather(*(write(app) for _ in range(10)))
    assert await check(app) == (True, before + 10)


async def test_a_tampered_row_is_reported(owner: async_sessionmaker[AsyncSession]) -> None:
    async with owner() as s:
        await s.begin()
        # Simulate an attacker with owner rights who switched the guard off; rolled back afterwards.
        await s.execute(text("ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only"))
        await s.execute(text("UPDATE audit_events SET action = 'm02.user.removed' WHERE id = 'aud-ls-05'"))
        await bind_tenant(s, LS)
        result = await verify_chain(s, LS.tenant_id)
        await s.rollback()
    assert (result.ok, result.broken_at) == (False, "aud-ls-05")


async def test_app_role_cannot_update_or_delete_audit_rows(app: async_sessionmaker[AsyncSession]) -> None:
    for statement in ("UPDATE audit_events SET action = action", "DELETE FROM audit_events"):
        with pytest.raises(DBAPIError, match="permission denied"):
            async with app() as s, s.begin():
                await bind_tenant(s, LS)
                await s.execute(text(statement))


async def test_even_the_owner_cannot_update_and_only_deletes_in_maintenance(
    owner: async_sessionmaker[AsyncSession],
) -> None:
    with pytest.raises(DBAPIError, match="append-only"):
        async with owner() as s, s.begin():
            await s.execute(text("UPDATE audit_events SET action = action WHERE id = 'aud-ls-01'"))
    with pytest.raises(DBAPIError, match="append-only"):
        async with owner() as s, s.begin():
            await s.execute(text("DELETE FROM audit_events WHERE id = 'aud-ls-01'"))
    async with owner() as s:
        await s.begin()
        await s.execute(text("SELECT set_config('nexus.audit_maintenance', 'on', true)"))
        deleted = await s.execute(text("DELETE FROM audit_events WHERE id = 'aud-ls-01'"))
        assert deleted.rowcount == 1  # type: ignore[attr-defined]
        await s.rollback()


async def test_record_audit_needs_the_same_tenant_context(app: async_sessionmaker[AsyncSession]) -> None:
    with pytest.raises(RuntimeError, match="same tenant"):
        async with app() as s, s.begin():
            await bind_tenant(s, TenantContext("ten-rv"))
            await record_audit(s, LS, INVITED)


def test_contract_rules_are_enforced_before_writing() -> None:
    with pytest.raises(ValueError, match="grant_id"):
        AuditInput(action="m01.tenant.viewed", actor_kind="provider_grant", actor_id="pst-1", target_type="x")
    with pytest.raises(ValueError, match="actor_id"):
        AuditInput(action="m06.retention.checked", actor_kind="system", actor_id="usr-1", target_type="x")
    with pytest.raises(ValueError):
        AuditInput(action="m02.user", actor_kind="system", target_type="user")
    assert changes("person.phone", sensitive=["person.phone"])[0].sensitive is True
