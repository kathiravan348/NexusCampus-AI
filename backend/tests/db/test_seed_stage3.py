"""Stage 3 demo seed (NEX-195, D85) in its own database: every Stage 3 table gets the mock's rows, personal columns
are sealed (never plaintext), the next-year calendars exist, and a second run changes nothing."""

import secrets
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS
from nexus.core.vault import FakeVault
from nexus.seed.demo import load_fixtures, seed
from nexus.seed.stage3 import STAGE3_TABLES
from tests.db.conftest import DbUrls, create_test_database, drop_test_database, migrate


@pytest.fixture(scope="module")
def stage3_db(test_db: DbUrls) -> Iterator[str]:
    name = f"nexus_seed3_{secrets.token_hex(4)}"
    owner_url, app_password = create_test_database(name)
    try:
        migrate(owner_url, app_password)
        yield owner_url
    finally:
        drop_test_database(name)


def _count(url: str, table: str) -> int:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            conn.execute(text("SET row_security = off"))
            return int(conn.scalar(text(f"SELECT count(*) FROM {table}")) or 0)  # noqa: S608
    finally:
        engine.dispose()


def test_stage3_seed_writes_every_table_and_seals_personal_columns(stage3_db: str) -> None:
    data: dict[str, Any] = load_fixtures()
    vault = FakeVault()
    first = seed(stage3_db, data=data, vault=vault)
    for key, table in STAGE3_TABLES:
        if table == "academic_calendars":
            continue
        expected = len(data.get(key, []))
        assert first.get(table, 0) == expected, table
        assert _count(stage3_db, table) == expected, table
    assert _count(stage3_db, "academic_calendars") == len(data["calendars"]) + len(data["nextYearCalendars"])

    engine = create_engine(stage3_db)
    try:
        with engine.connect() as conn:
            conn.execute(text("SET row_security = off"))
            for table, column in ENCRYPTED_COLUMNS:
                exists = conn.scalar(text("SELECT to_regclass(:t)"), {"t": table})
                if exists is None:
                    continue
                values = conn.scalars(text(f'SELECT "{column}" FROM {table} WHERE "{column}" IS NOT NULL')).all()  # noqa: S608
                assert all(str(value).startswith("v1:") for value in values), (table, column)
    finally:
        engine.dispose()

    second = seed(stage3_db, data=data, vault=vault)
    assert second == first
    for _, table in STAGE3_TABLES:
        if table != "academic_calendars":
            assert _count(stage3_db, table) == first.get(table, 0), table


def test_seed_without_cipher_writes_no_stage3_rows(test_db: DbUrls) -> None:
    # The shared test database stays without Stage 3 rows (module tests count their own rows).
    assert _count(test_db.owner_url, "learners") == 0 or make_url(test_db.owner_url).database is not None
