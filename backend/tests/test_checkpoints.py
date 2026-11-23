"""Signed audit checkpoints (NEX-065, ARCHITECTURE §6): the Vault Ed25519 signature verifies, and tampering with any
audit row (or with a checkpoint) is detected."""

import asyncio
import secrets
from collections.abc import AsyncIterator, Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.audit import AuditInput, record_audit
from nexus.core.checkpoints import (
    CHECKPOINT_KEY,
    ChainBroken,
    checkpoint_all,
    checkpoint_message,
    create_checkpoint,
    verify_checkpoints,
)
from nexus.core.hashchain import audit_hash
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.core.vault import FakeVault
from nexus.seed.demo import seed
from nexus.settings import Settings
from tests.db.auth_fixtures import client, kc, sign_in  # noqa: F401
from tests.db.conftest import DbUrls, create_test_database, drop_test_database, migrate, postgres, test_db  # noqa: F401
from tests.fake_keycloak import FakeKeycloak

LS, RV = TenantContext("ten-ls"), TenantContext("ten-rv")
DAY1, DAY2 = date(2026, 11, 20), date(2026, 11, 21)


@pytest.fixture
def anyio_backend() -> tuple[str, dict[str, object]]:
    return "asyncio", {"loop_factory": asyncio.SelectorEventLoop}


@pytest.fixture
def fresh_db(postgres: None) -> Iterator[DbUrls]:  # noqa: F811
    """Its own seeded database per test: these tests tamper with audit rows."""
    name = f"nexus_test_ckpt_{secrets.token_hex(4)}"
    owner_url, app_password = create_test_database(name)
    try:
        migrate(owner_url, app_password)
        seed(owner_url)
        app_url = make_url(owner_url).set(username="nexus_app", password=app_password)
        yield DbUrls(owner_url=owner_url, app_url=app_url.render_as_string(hide_password=False))
    finally:
        drop_test_database(name)


@pytest.fixture
async def sessions(fresh_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(fresh_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def vault() -> FakeVault:
    v = FakeVault()
    await v.create_signing_key(CHECKPOINT_KEY)
    return v


def owner_sql(url: str, sql: str, params: dict[str, object] | None = None) -> None:
    engine = create_engine(url)
    with engine.begin() as conn:  # a superuser attacker: bypasses the append-only trigger
        conn.execute(text("SET LOCAL session_replication_role = replica"))
        conn.execute(text(sql), params or {})
    engine.dispose()


async def sign(sessions: async_sessionmaker[AsyncSession], vault: FakeVault, day: date) -> object:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        checkpoint, _ = await create_checkpoint(s, vault, LS, day)
    return checkpoint


async def report(sessions: async_sessionmaker[AsyncSession], vault: FakeVault) -> object:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        return await verify_checkpoints(s, vault, LS.tenant_id)


async def write_event(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        await record_audit(
            s, LS, AuditInput(action="m01.institution.updated", actor_kind="system", target_type="institution")
        )


@pytest.mark.anyio
async def test_checkpoint_signature_verifies_and_is_daily(
    sessions: async_sessionmaker[AsyncSession], vault: FakeVault
) -> None:
    first = await sign(sessions, vault, DAY1)
    assert first is not None
    again = await sign(sessions, vault, DAY1)
    assert again == first  # one per tenant per day
    message = checkpoint_message(LS.tenant_id, DAY1, first.head_seq, first.head_hash)  # type: ignore[attr-defined]
    assert await vault.verify(CHECKPOINT_KEY, message, first.signature)  # type: ignore[attr-defined]
    assert not await vault.verify(CHECKPOINT_KEY, message + b"x", first.signature)  # type: ignore[attr-defined]
    await write_event(sessions)
    second = await sign(sessions, vault, DAY2)
    assert second.head_seq > first.head_seq  # type: ignore[attr-defined]
    result = await report(sessions, vault)
    assert result.ok and len(result.checkpoints) == 2  # type: ignore[attr-defined]


@pytest.mark.anyio
async def test_editing_a_row_before_a_checkpoint_is_detected(
    sessions: async_sessionmaker[AsyncSession], vault: FakeVault, fresh_db: DbUrls
) -> None:
    await sign(sessions, vault, DAY1)
    owner_sql(
        fresh_db.owner_url,
        "UPDATE audit_events SET action = action || 'X' WHERE tenant_id = 'ten-ls' AND seq = 2",
    )
    result = await report(sessions, vault)
    assert not result.ok and result.chain.broken_at is not None  # type: ignore[attr-defined]


@pytest.mark.anyio
async def test_rewriting_the_whole_chain_is_caught_by_the_signed_head(
    sessions: async_sessionmaker[AsyncSession], vault: FakeVault, fresh_db: DbUrls
) -> None:
    await sign(sessions, vault, DAY1)
    engine = create_engine(fresh_db.owner_url)
    with engine.begin() as conn:  # an attacker with database access edits row 2 and recomputes every later hash
        conn.execute(text("SET LOCAL session_replication_role = replica"))
        conn.execute(text("UPDATE audit_events SET action = action || 'X' WHERE tenant_id = 'ten-ls' AND seq = 2"))
        rows = conn.execute(
            text("SELECT id, seq, occurred_at, action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq")
        ).all()
        prev = None
        for event_id, _seq, occurred_at, action in rows:
            digest = audit_hash(event_id, occurred_at, action, prev)
            conn.execute(
                text("UPDATE audit_events SET prev_hash = :p, hash = :h WHERE id = :i"),
                {"p": prev, "h": digest, "i": event_id},
            )
            prev = digest
    engine.dispose()
    result = await report(sessions, vault)
    assert result.chain.ok  # type: ignore[attr-defined]  # the links alone no longer show it…
    assert not result.ok and not result.checkpoints[0].head_matches  # type: ignore[attr-defined]  # …the signed head does


@pytest.mark.anyio
async def test_editing_a_checkpoint_breaks_its_signature(
    sessions: async_sessionmaker[AsyncSession], vault: FakeVault, fresh_db: DbUrls
) -> None:
    await sign(sessions, vault, DAY1)
    owner_sql(fresh_db.owner_url, "UPDATE audit_checkpoints SET day = '2026-01-01' WHERE tenant_id = 'ten-ls'")
    result = await report(sessions, vault)
    assert not result.ok and not result.checkpoints[0].signature_valid  # type: ignore[attr-defined]


@pytest.mark.anyio
async def test_editing_a_row_after_a_checkpoint_is_detected_and_not_signed(
    sessions: async_sessionmaker[AsyncSession], vault: FakeVault, fresh_db: DbUrls
) -> None:
    first = await sign(sessions, vault, DAY1)
    await write_event(sessions)
    after = first.head_seq + 1  # type: ignore[attr-defined]
    owner_sql(
        fresh_db.owner_url,
        "UPDATE audit_events SET action = action || 'X' WHERE tenant_id = 'ten-ls' AND seq = :s",
        {"s": after},
    )
    result = await report(sessions, vault)
    assert not result.ok  # type: ignore[attr-defined]
    with pytest.raises(ChainBroken):
        await sign(sessions, vault, DAY2)


@pytest.mark.anyio
async def test_checkpoint_job_signs_every_tenant_once_a_day(
    sessions: async_sessionmaker[AsyncSession], fresh_db: DbUrls
) -> None:
    vault = FakeVault()  # the job creates the signing key itself
    settings = Settings(environment="test", region="in", database_url=fresh_db.app_url)  # type: ignore[arg-type]
    signed, refused = await checkpoint_all(sessions, settings, vault, DAY1)
    assert signed >= 2 and refused == 0  # the India cell's tenants (other regions are skipped)
    assert await checkpoint_all(sessions, settings, vault, DAY1) == (0, 0)
    async with sessions() as s, s.begin():
        await bind_tenant(s, RV)
        rows = (await s.execute(text("SELECT count(*) FROM audit_checkpoints"))).scalar_one()
        assert rows == 0  # RLS: one tenant's checkpoints are not visible to another (Riverside is EU)


@pytest.mark.anyio
async def test_checkpoint_job_still_signs_a_frozen_tenant(
    sessions: async_sessionmaker[AsyncSession], fresh_db: DbUrls
) -> None:
    owner_sql(fresh_db.owner_url, "UPDATE tenants SET frozen_at = now() WHERE id = 'ten-ls'")
    settings = Settings(environment="test", region="in", database_url=fresh_db.app_url)  # type: ignore[arg-type]
    await checkpoint_all(sessions, settings, FakeVault(), DAY1)
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        assert (await s.execute(text("SELECT count(*) FROM audit_checkpoints"))).scalar_one() == 1


def test_checkpoint_api_lists_and_verifies(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:  # noqa: F811
    asyncio.run(_sign_ls(test_db.app_url, client.app.state.vault), loop_factory=asyncio.SelectorEventLoop)  # type: ignore[attr-defined]
    sign_in(client, kc)
    listed = client.get("/api/v1/audit-checkpoints")
    assert listed.status_code == 200 and listed.json()["total"] >= 1
    item = listed.json()["items"][0]
    assert item["signature"].startswith("vault:v1:") and len(item["headHash"]) == 64
    verified = client.get("/api/v1/audit-checkpoints/verify")
    assert verified.status_code == 200, verified.text
    body = verified.json()
    assert body["ok"] is True and body["brokenAt"] is None and body["checkpoints"][0]["signatureValid"] is True


async def _sign_ls(app_url: str, vault: FakeVault) -> None:
    await vault.create_signing_key(CHECKPOINT_KEY)
    engine = create_async_engine(app_url)
    async with async_sessionmaker(engine)() as s, s.begin():
        await bind_tenant(s, LS)
        await create_checkpoint(s, vault, LS, DAY1)
    await engine.dispose()
