"""Alembic environment: runs migrations as the owner role (`NEXUS_MIGRATE_DATABASE_URL`).

Tests pass their own URL through `config.attributes["url"]`. Migrations are written by hand (no autogenerate
in CI); `tests/db/test_migrations.py` proves the models and the migrated schema agree.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from nexus.core import audit_models as _audit  # noqa: F401  (registers the tables on Base.metadata)
from nexus.core import rbac_models as _rbac  # noqa: F401
from nexus.core.models import Base
from nexus.modules.m01 import models as _m01  # noqa: F401
from nexus.modules.m02 import models as _m02  # noqa: F401
from nexus.modules.m03 import models as _m03  # noqa: F401
from nexus.modules.m04 import models as _m04  # noqa: F401
from nexus.modules.m06 import models as _m06  # noqa: F401
from nexus.modules.m83 import models as _m83  # noqa: F401
from nexus.settings import get_settings

config = context.config
if config.config_file_name is not None and not config.attributes.get("url"):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    url = config.attributes.get("url")
    if isinstance(url, str) and url:
        return url
    return get_settings().migrate_database_url.get_secret_value()


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
