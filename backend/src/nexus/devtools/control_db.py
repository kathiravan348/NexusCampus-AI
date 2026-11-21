"""`uv run --project backend nexus-control-db`: creates the `nexus_control` database if missing (in the local
Compose PostgreSQL), runs the control migrations and loads the demo staff (NEX-096)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from nexus.control.seed import seed
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console
from nexus.settings import BACKEND_ROOT


def alembic_config(url: str, app_password: str) -> Config:
    cfg = Config(str(Path(BACKEND_ROOT) / "control_alembic.ini"))
    cfg.attributes["url"] = url
    cfg.attributes["app_db_password"] = app_password
    return cfg


def ensure_database(owner_url: str) -> bool:
    """Creates the database named in `owner_url` when missing; True when it was created."""
    url = make_url(owner_url)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}).first()
            if exists:
                return False
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
            return True
    finally:
        admin.dispose()


def main() -> None:
    utf8_console()
    settings = get_control_settings()
    owner = settings.owner_url()
    created = ensure_database(owner)
    command.upgrade(alembic_config(owner, settings.app_password()), "head")
    engine = create_engine(owner)
    try:
        with engine.begin() as conn:
            count = seed(conn)
    finally:
        engine.dispose()
    print(f"nexus_control: {'created, ' if created else ''}migrated, {count} staff seeded")


if __name__ == "__main__":
    main()
