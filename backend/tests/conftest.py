from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from nexus.main import create_app
from nexus.settings import Settings


@pytest.fixture
def settings() -> Settings:
    # Points at no real services: tests never need Docker; readiness is patched where it matters.
    return Settings(
        environment="test",
        database_url="postgresql+psycopg://nexus@127.0.0.1:1/nexus",  # type: ignore[arg-type]
        redis_url="redis://127.0.0.1:1/0",  # type: ignore[arg-type]
        otel_exporter="none",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), raise_server_exceptions=False) as c:
        yield c
