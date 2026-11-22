"""Shared control-database fixture (NEX-096, NEX-101): a throwaway `nexus_control` copy, migrated and seeded."""

import secrets
from collections.abc import AsyncIterator, Iterator

import httpx2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.main import create_app
from nexus.control.seed import seed
from nexus.control.sessions import DbSessionStore
from nexus.control.settings import CONTROL_APP_ROLE, ControlSettings
from nexus.control.staff import DbStaffStore
from nexus.core.vault import FakeVault
from nexus.devtools.control_db import alembic_config
from tests.db.conftest import create_test_database, drop_test_database


@pytest.fixture(scope="module")
def control_db(postgres: None) -> Iterator[tuple[str, str]]:
    from alembic import command

    name = f"nexus_control_test_{secrets.token_hex(4)}"
    owner_url, password = create_test_database(name)
    try:
        command.upgrade(alembic_config(owner_url, password), "head")
        engine = create_engine(owner_url)
        with engine.begin() as conn:
            seed(conn)
            seed(conn)  # idempotent
        engine.dispose()
        app_url = make_url(owner_url).set(username=CONTROL_APP_ROLE, password=password)
        yield owner_url, app_url.render_as_string(hide_password=False)
    finally:
        drop_test_database(name)


@pytest.fixture
def fake_vault() -> FakeVault:
    return FakeVault()


@pytest.fixture
async def api(control_db: tuple[str, str], fake_vault: FakeVault) -> AsyncIterator[httpx2.AsyncClient]:
    _, app_url = control_db
    engine = create_async_engine(app_url)
    app = create_app(ControlSettings(environment="test"))
    app.state.engine = engine  # the lifespan is not run by the ASGI transport
    app.state.staff = DbStaffStore(engine)
    app.state.sessions = DbSessionStore(engine)
    app.state.vault = fake_vault  # real Ed25519 in memory
    async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://control.test") as c:
        yield c
    await engine.dispose()
