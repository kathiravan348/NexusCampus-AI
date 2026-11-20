"""M11 test helpers (NEX-058): Apex (Tamil, AI on, 95 % of its credits used) is the AI tenant of the test cell."""

from collections.abc import AsyncIterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m11.gateway import Gateway
from nexus.modules.m11.providers.fake import FakeProvider
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

KARTHIK: dict[str, Any] = {"email": "karthik@apex.example.edu", "sub": "kc-karthik", "organization": ["ten-ax"]}
MEENA: dict[str, Any] = {"email": "meena@apex.example.edu", "sub": "kc-meena", "organization": ["ten-ax"]}
ASK = "/api/v1/assist/ask"
TAMIL_QUESTION = {"question": "முதல் பேட்ச் எப்போது முடிகிறது?", "locale": "ta-IN"}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def fake_ai(client: TestClient, **kwargs: Any) -> FakeProvider:
    """Installs a fresh fake provider so a test can see every model call."""
    provider = FakeProvider(**kwargs)
    models = {"fast": "fake-fast", "balanced": "fake-balanced", "reasoning": "fake-reasoning", "multimodal": "fake-mm"}
    client.app.state.ai_gateway = Gateway(provider, models)  # type: ignore[attr-defined]
    return provider


def as_karthik(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **KARTHIK)


@pytest.fixture
async def sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()
