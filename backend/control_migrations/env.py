"""Alembic environment of the control database (`nexus_control`), separate from the product migrations.

Runs as the owner role (`ControlSettings.owner_url()`); tests pass their own URL through `config.attributes["url"]`.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from nexus.control import accounts as _accounts  # noqa: F401  (registers the P01 tables)
from nexus.control import commercial as _commercial  # noqa: F401
from nexus.control import sessions as _sessions  # noqa: F401
from nexus.control.settings import get_control_settings
from nexus.control.staff import metadata

config = context.config
if config.config_file_name is not None and not config.attributes.get("url"):
    fileConfig(config.config_file_name)

target_metadata = metadata


def _url() -> str:
    url = config.attributes.get("url")
    if isinstance(url, str) and url:
        return url
    return get_control_settings().owner_url()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, version_table="control_alembic_version"
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations_online()
