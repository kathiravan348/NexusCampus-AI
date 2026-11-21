"""Control backend configuration (prefix `NEXUS_CONTROL_`, same `backend/.env`).

Its database is `nexus_control`, separate from the product database. In dev the URLs default to the product's local
PostgreSQL with the database (and app role) swapped, so one Compose PostgreSQL serves both.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

from nexus.settings import BACKEND_ROOT, Environment, get_settings

CONTROL_DB = "nexus_control"
CONTROL_APP_ROLE = "control_app"


class ControlSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXUS_CONTROL_",
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Environment = "dev"
    #: App connection as `control_app`; empty = the product URL with role and database swapped (dev).
    database_url: SecretStr = SecretStr("")
    #: Owner connection for migrations and seed only; empty = the product owner URL on `nexus_control`.
    migrate_database_url: SecretStr = SecretStr("")
    #: Password the first migration gives `control_app`; empty = the product app password (dev only).
    app_db_password: SecretStr = SecretStr("")
    #: Staff sessions are short (P13).
    session_minutes: int = 60

    @property
    def dev_staff_header(self) -> bool:
        """`X-Nexus-Staff` picks the staff member until staff SSO exists — never in prod."""
        return self.environment != "prod"

    def app_password(self) -> str:
        value = self.app_db_password.get_secret_value() or get_settings().app_db_password.get_secret_value()
        if not value:
            raise RuntimeError("Set NEXUS_CONTROL_APP_DB_PASSWORD (backend/.env).")
        return value

    def owner_url(self) -> str:
        if self.migrate_database_url.get_secret_value():
            return self.migrate_database_url.get_secret_value()
        url = make_url(get_settings().migrate_database_url.get_secret_value()).set(database=CONTROL_DB)
        return url.render_as_string(hide_password=False)

    def app_url(self) -> str:
        if self.database_url.get_secret_value():
            return self.database_url.get_secret_value()
        url = make_url(get_settings().database_url.get_secret_value()).set(
            database=CONTROL_DB, username=CONTROL_APP_ROLE, password=self.app_password()
        )
        return url.render_as_string(hide_password=False)


@lru_cache
def get_control_settings() -> ControlSettings:
    return ControlSettings()
