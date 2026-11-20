"""Data residency (G-5, D45): a cell serves only tenants of its own region."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.errors import ApiError
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.settings import Settings
from tests.db.conftest import DbUrls

pytestmark = pytest.mark.anyio


@pytest.fixture
async def sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


def cell(region: str) -> Settings:
    return Settings(environment="test", region=region)  # type: ignore[arg-type]


async def test_in_cell_serves_an_indian_tenant(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with tenant_transaction(sessions, TenantContext("ten-ax"), cell("in")) as session:
        name = (await session.execute(text("SELECT name FROM institutions"))).scalar_one()
    assert name == "Apex Coaching"


async def test_in_cell_refuses_an_eu_tenant(sessions: async_sessionmaker[AsyncSession]) -> None:
    with pytest.raises(ApiError) as refused:
        async with tenant_transaction(sessions, TenantContext("ten-rv"), cell("in")):
            pass
    assert (refused.value.status, refused.value.code) == (503, "internal")
    assert "eu" not in refused.value.message


async def test_eu_cell_serves_the_eu_tenant(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with tenant_transaction(sessions, TenantContext("ten-rv"), cell("eu")) as session:
        count = (await session.execute(text("SELECT count(*) FROM campuses"))).scalar_one()
    assert count == 2


async def test_unknown_tenant_is_refused(sessions: async_sessionmaker[AsyncSession]) -> None:
    with pytest.raises(ApiError):
        async with tenant_transaction(sessions, TenantContext("ten-nope"), cell("in")):
            pass
