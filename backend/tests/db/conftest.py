"""Database tests run against a throwaway database in the local Compose PostgreSQL (`nexus-compose-up`).

Without a reachable PostgreSQL they are skipped with a reason; set `NEXUS_REQUIRE_DB=1` to fail instead (CI).
The `nexus_app` role is cluster-wide, so tests reuse the configured app password and never change it.
"""

import asyncio
import os
import secrets
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from nexus.seed.demo import seed
from nexus.settings import BACKEND_ROOT, get_settings


@dataclass(frozen=True)
class DbUrls:
    owner_url: str
    app_url: str


def _alembic(url: str, app_password: str) -> Config:
    cfg = Config(str(Path(BACKEND_ROOT) / "alembic.ini"))
    cfg.attributes["url"] = url
    cfg.attributes["app_db_password"] = app_password
    return cfg


def _admin_url() -> str:
    return get_settings().migrate_database_url.get_secret_value()


def create_test_database(name: str) -> tuple[str, str]:
    """Creates database `name`; returns (owner url, app password)."""
    admin = make_url(_admin_url())
    engine = create_engine(admin.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    finally:
        engine.dispose()
    app_password = get_settings().app_db_password.get_secret_value() or secrets.token_urlsafe(24)
    return admin.set(database=name).render_as_string(hide_password=False), app_password


def drop_test_database(name: str) -> None:
    admin = make_url(_admin_url())
    engine = create_engine(admin.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    finally:
        engine.dispose()


def migrate(owner_url: str, app_password: str, target: str = "head") -> None:
    command.upgrade(_alembic(owner_url, app_password), target)


def downgrade(owner_url: str, app_password: str, target: str = "base") -> None:
    command.downgrade(_alembic(owner_url, app_password), target)


def _postgres_reachable() -> bool:
    try:
        engine = create_engine(
            make_url(_admin_url()).set(database="postgres"), connect_args={"connect_timeout": 2}
        )
        with engine.connect():
            pass
        engine.dispose()
    except Exception:
        return False
    return True


@pytest.fixture(scope="session")
def postgres() -> None:
    if not _postgres_reachable():
        if os.environ.get("NEXUS_REQUIRE_DB") == "1":
            pytest.fail("PostgreSQL is not reachable and NEXUS_REQUIRE_DB=1")
        pytest.skip("PostgreSQL not reachable: run `uv run --project backend nexus-compose-up`")


@pytest.fixture(scope="session")
def test_db(postgres: None) -> Iterator[DbUrls]:
    """A migrated and seeded database for the whole session; dropped afterwards."""
    name = f"nexus_test_{secrets.token_hex(4)}"
    owner_url, app_password = create_test_database(name)
    try:
        migrate(owner_url, app_password)
        seed(owner_url)
        app_url = make_url(owner_url).set(username="nexus_app", password=app_password)
        yield DbUrls(owner_url=owner_url, app_url=app_url.render_as_string(hide_password=False))
    finally:
        drop_test_database(name)


@pytest.fixture
def anyio_backend() -> tuple[str, dict[str, object]]:
    # psycopg's async driver needs a selector event loop (Windows defaults to the proactor loop).
    return "asyncio", {"loop_factory": asyncio.SelectorEventLoop}


# Shared sign-in fixtures for API tests (defined in auth_fixtures.py, registered here).
from tests.db.auth_fixtures import client, kc  # noqa: E402, F401
