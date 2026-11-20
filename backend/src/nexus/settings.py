"""Runtime configuration from environment variables (prefix `NEXUS_`) or `backend/.env` (git-ignored)."""

from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["dev", "test", "prod"]
#: Data regions with a running cell (D45): IN = AWS ap-south-1, EU = AWS eu-central-1.
CellRegion = Literal["in", "eu"]
OtelExporter = Literal["none", "console"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXUS_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    environment: Environment = "dev"
    region: CellRegion = "in"
    #: SQLAlchemy URL, e.g. `postgresql+psycopg://nexus:<password>@127.0.0.1:55432/nexus`.
    #: A secret: never logged.
    database_url: SecretStr = SecretStr("postgresql+psycopg://nexus@127.0.0.1:55432/nexus")
    redis_url: SecretStr = SecretStr("redis://127.0.0.1:56379/0")
    otel_exporter: OtelExporter = "none"
    host: str = "127.0.0.1"
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    return Settings()
