import pytest
from fastapi.testclient import TestClient

import nexus.main


def test_healthz_answers(client: TestClient) -> None:
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
    assert len(res.headers["X-Request-Id"]) == 32


def test_readyz_is_503_when_services_are_down(client: TestClient) -> None:
    res = client.get("/readyz")
    assert res.status_code == 503
    assert res.json() == {"status": "not_ready", "database": False, "redis": False}


def test_readyz_is_200_when_database_and_redis_answer(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def up() -> bool:
        return True

    monkeypatch.setattr(nexus.main, "ping_database", up)
    monkeypatch.setattr(nexus.main, "ping_redis", up)
    res = client.get("/readyz")
    assert res.status_code == 200
    assert res.json() == {"status": "ready", "database": True, "redis": True}
