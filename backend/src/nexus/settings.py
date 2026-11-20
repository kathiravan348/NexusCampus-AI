"""Runtime configuration from environment variables (prefix `NEXUS_`) or `backend/.env` (git-ignored)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["dev", "test", "prod"]
#: Data regions with a running cell (D45): IN = AWS ap-south-1, EU = AWS eu-central-1.
CellRegion = Literal["in", "eu"]
OtelExporter = Literal["none", "console"]

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXUS_",
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Environment = "dev"
    region: CellRegion = "in"
    #: App connection as `nexus_app` (no BYPASSRLS), e.g.
    #: `postgresql+psycopg://nexus_app:<password>@127.0.0.1:55432/nexus`. Secrets: never logged.
    database_url: SecretStr = SecretStr("postgresql+psycopg://nexus_app@127.0.0.1:55432/nexus")
    #: Owner connection for migrations and the demo seed only (never used to serve requests).
    migrate_database_url: SecretStr = SecretStr("postgresql+psycopg://nexus@127.0.0.1:55432/nexus")
    #: Password the baseline migration gives the `nexus_app` role.
    app_db_password: SecretStr = SecretStr("")
    redis_url: SecretStr = SecretStr("redis://127.0.0.1:56379/0")
    # Sign-in (D44): the backend is the OIDC client of the cell's Keycloak realm.
    keycloak_url: str = "http://127.0.0.1:58080"
    keycloak_realm: str = "nexus-dev"
    oidc_client_id: str = "nexus-backend"
    oidc_client_secret: SecretStr = SecretStr("")
    #: Public address of this API (the OIDC redirect URI is `<api_public_url>/api/v1/auth/callback`).
    api_public_url: str = "http://127.0.0.1:8000"
    #: The campus app; sign-in and sign-out return here.
    app_public_url: str = "http://127.0.0.1:3100"
    session_idle_minutes: int = 30
    session_absolute_hours: int = 12
    # Keys and secrets (D46): HashiCorp Vault (or OpenBao) Transit engine.
    vault_url: str = "http://127.0.0.1:58200"
    vault_token: SecretStr = SecretStr("")
    vault_transit_mount: str = "transit"
    # Dev-only Keycloak setup (`nexus-keycloak-dev`): admin login and the password given to demo users.
    keycloak_admin_user: str = "admin"
    keycloak_admin_password: SecretStr = SecretStr("")
    demo_user_password: SecretStr = SecretStr("")
    otel_exporter: OtelExporter = "none"
    host: str = "127.0.0.1"
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()
