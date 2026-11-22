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
    #: HMAC key for provider grant credentials (NEX-051). Empty in dev/test = a random key per process;
    #: required in prod.
    grant_signing_key: SecretStr = SecretStr("")
    # AI gateway (NEX-058, D24): `fake` (deterministic, dev/test), `anthropic` (direct API, key in `.env`) or
    # `bedrock` (Claude on Amazon Bedrock in this cell's own AWS region, SaaS).
    ai_provider: Literal["fake", "anthropic", "bedrock"] = "fake"
    anthropic_api_key: SecretStr = SecretStr("")
    #: Capability tier → model id (DECISIONS); Bedrock ids get the `anthropic.` prefix.
    ai_model_fast: str = "claude-haiku-5-5"
    ai_model_balanced: str = "claude-sonnet-5-5"
    ai_model_reasoning: str = "claude-opus-5-5"
    #: Multilingual embedding model on Bedrock (D47), pinned; dims must match `ai_chunks.embedding`.
    ai_embedding_model: str = "cohere.embed-multilingual-v3"
    # Dev-only Keycloak setup (`nexus-keycloak-dev`): admin login and the password given to demo users.
    keycloak_admin_user: str = "admin"
    keycloak_admin_password: SecretStr = SecretStr("")
    demo_user_password: SecretStr = SecretStr("")
    otel_exporter: OtelExporter = "none"
    host: str = "127.0.0.1"
    port: int = 8000
    # Install agent (M84, NEX-105): only a self-hosted install runs it and serves the Install & updates screen.
    install_mode: Literal["saas", "self_hosted"] = "saas"
    install_id: str = "ins-dev"
    #: Holds `licence.json`, `licence-keys.json`, `release-keys.json` and `inbox/` (offline update bundles).
    install_dir: Path = BACKEND_ROOT / "install"
    #: The version this install runs (set by the image build).
    app_version: str = "2.4.1"
    release_channel: Literal["stable", "lts", "preview"] = "stable"
    #: Air-gapped: never connects to Nexus Control (V-6); telemetry is then always off.
    air_gapped: bool = False
    #: PII-free health reports to Nexus Control; the institution can switch them off.
    telemetry_enabled: bool = True
    #: Transit key whose fresh data keys encrypt each backup (NEX-112); the plaintext key never touches the disk.
    backup_key_name: str = "install-backup"
    #: Where encrypted backups and diagnostic bundles are written; default: inside `install_dir`.
    backup_dir: Path | None = None
    diagnostics_dir: Path | None = None
    #: Log folder the diagnostic bundle reads (scrubbed); none = no log lines.
    log_dir: Path | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
