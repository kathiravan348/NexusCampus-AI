"""Sync conflicts (NEX-057, M10): no payloads, resolve once, the device count follows."""

from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.modules.m10.service import record_conflict
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import last_action, owner_sql
from tests.fake_keycloak import FakeKeycloak

LS = TenantContext("ten-ls")


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def conflict_count(owner_url: str, device_id: str) -> int:
    rows = owner_sql(owner_url, "SELECT conflict_count FROM devices WHERE id = :d", {"d": device_id})
    return int(rows[0][0])


@pytest.fixture
async def sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.anyio
async def test_recorded_conflicts_carry_no_payload(sessions: async_sessionmaker[AsyncSession], test_db: DbUrls) -> None:
    before = conflict_count(test_db.owner_url, "dev-ls-office-pc")
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        await record_conflict(
            s,
            LS,
            "dev-ls-office-pc",
            module_id="M01",
            operation="calendar.update",
            merge_rule="manual-review-only",
            summary_key="m10.conflict.calendarChanged",
            client_version=3,
            server_version=4,
        )
    assert conflict_count(test_db.owner_url, "dev-ls-office-pc") == before + 1
    columns = owner_sql(
        test_db.owner_url, "SELECT column_name FROM information_schema.columns WHERE table_name = 'sync_conflicts'"
    )
    assert not {c[0] for c in columns} & {"payload", "data", "body", "value"}


def test_resolve_once_and_count_drops(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    items = client.get("/api/v1/sync-conflicts?pageSize=100").json()["items"]
    open_ = next(c for c in items if c["status"] == "open")
    before = conflict_count(test_db.owner_url, open_["deviceId"])
    url = f"/api/v1/sync-conflicts/{open_['id']}/resolve"
    assert client.post(url, json={}, headers=csrf(client)).status_code == 400
    done = client.post(url, json={"resolution": "keep_server"}, headers=csrf(client))
    assert done.status_code == 200 and done.json()["status"] == "resolved" and done.json()["resolvedAt"]
    assert last_action(test_db.owner_url) == "m10.conflict.resolved"
    assert conflict_count(test_db.owner_url, open_["deviceId"]) == max(before - 1, 0)
    assert client.post(url, json={"resolution": "merged"}, headers=csrf(client)).status_code == 409
    unknown = client.post(
        "/api/v1/sync-conflicts/scf-nope/resolve", json={"resolution": "merged"}, headers=csrf(client)
    )
    assert unknown.status_code == 404
