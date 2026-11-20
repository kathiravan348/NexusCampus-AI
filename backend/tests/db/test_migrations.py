"""The baseline migration upgrades and downgrades cleanly, and matches the SQLAlchemy models."""

import secrets

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from nexus.core import audit_models as _audit  # noqa: F401  (registers the tables)
from nexus.core import rbac_models as _rbac  # noqa: F401
from nexus.core.models import Base
from nexus.modules.m01 import models as _m01  # noqa: F401
from nexus.modules.m02 import models as _m02  # noqa: F401
from tests.db.conftest import (
    DbUrls,
    create_test_database,
    downgrade,
    drop_test_database,
    migrate,
)

TENANCY = {"tenants", "groups", "institutions", "campuses", "academic_calendars"}


def test_upgrade_head_and_downgrade_base_on_an_empty_database(postgres: None) -> None:
    name = f"nexus_test_{secrets.token_hex(4)}"
    owner_url, app_password = create_test_database(name)
    try:
        migrate(owner_url, app_password)
        engine = create_engine(owner_url)
        assert set(inspect(engine).get_table_names()) >= TENANCY
        engine.dispose()
        downgrade(owner_url, app_password)
        engine = create_engine(owner_url)
        assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
        engine.dispose()
        migrate(owner_url, app_password)  # and up again
    finally:
        drop_test_database(name)


def test_models_match_the_migrated_schema(test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    try:
        with engine.connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    finally:
        engine.dispose()
    assert diff == []
