"""Shared control-database fixture (NEX-096, NEX-101): a throwaway `nexus_control` copy, migrated and seeded."""

import secrets
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from nexus.control.seed import seed
from nexus.control.settings import CONTROL_APP_ROLE
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
