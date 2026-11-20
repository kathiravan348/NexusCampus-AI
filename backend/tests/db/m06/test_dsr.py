"""Data subject requests (NEX-052, M06): due dates, overdue flag, one step at a time, every step audited."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

from nexus.core.hashchain import verify_chain
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.modules.m06.service import is_overdue, receive_request

LS = TenantContext("ten-ls")
ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def new_request(owner_url: str, dsr_id: str) -> None:
    engine = create_engine(owner_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO data_subject_requests (id, tenant_id, person_id, kind, status, received_at, due_at) "
                "VALUES (:id, 'ten-ls', 'per-ls-rohan', 'access', 'received', now(), now() + interval '30 days')"
            ),
            {"id": dsr_id},
        )
    engine.dispose()


def audit_rows(owner_url: str, dsr_id: str) -> list[tuple[str, Any]]:
    engine = create_engine(owner_url)
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT action, changes FROM audit_events WHERE target_id = :id ORDER BY seq"), {"id": dsr_id}
        ).all()
    engine.dispose()
    return [(r[0], r[1]) for r in rows]


@pytest.fixture
async def app_sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.anyio
async def test_received_request_is_due_by_the_tenants_pack(app_sessions: async_sessionmaker[AsyncSession]) -> None:
    received = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)
    async with app_sessions() as s, s.begin():
        await bind_tenant(s, LS)
        dsr = await receive_request(s, LS, "per-ls-ishaan", "export", received)
        assert (await verify_chain(s, LS.tenant_id)).ok
    assert dsr.status == "received" and dsr.due_at == received + timedelta(days=30)  # DPDP
    assert not is_overdue(dsr, dsr.due_at)
    assert is_overdue(dsr, dsr.due_at + timedelta(seconds=1))
    closed = dsr.model_copy(update={"status": "completed", "completed_at": dsr.due_at})
    assert not is_overdue(closed, dsr.due_at + timedelta(days=5))


def test_steps_follow_the_order_and_are_audited(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    new_request(test_db.owner_url, "dsr-ls-test-steps")
    sign_in(client, kc)
    url = "/api/v1/data-requests/dsr-ls-test-steps"
    listed = client.get("/api/v1/data-requests?pageSize=100").json()["items"]
    assert "dsr-ls-test-steps" in {r["id"] for r in listed}
    skip = client.patch(url, json={"status": "completed"}, headers=csrf(client))
    assert skip.status_code == 409 and skip.json()["error"]["code"] == "conflict"
    started = client.patch(url, json={"status": "in_progress"}, headers=csrf(client))
    assert started.status_code == 200 and started.json()["handledBy"] == "usr-ls-priya"
    assert started.json()["completedAt"] is None
    no_reason = client.patch(url, json={"status": "rejected", "reason": "  "}, headers=csrf(client))
    assert no_reason.status_code == 400 and no_reason.json()["error"]["details"][0]["path"] == "reason"
    reject = {"status": "rejected", "reason": "Identity not confirmed"}
    rejected = client.patch(url, json=reject, headers=csrf(client))
    assert rejected.status_code == 200 and rejected.json()["status"] == "rejected"
    assert rejected.json()["completedAt"] is not None
    assert client.patch(url, json={"status": "in_progress"}, headers=csrf(client)).status_code == 409
    rows = audit_rows(test_db.owner_url, "dsr-ls-test-steps")
    assert [a for a, _ in rows] == ["m06.dataRequest.started", "m06.dataRequest.rejected"]
    assert [c["field"] for c in rows[1][1]] == ["status", "rejectionReason"]
    assert "Identity" not in str(rows)  # the reason text never reaches the audit log


def test_unknown_bad_body_and_permission(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    new_request(test_db.owner_url, "dsr-ls-test-body")
    sign_in(client, kc)
    unknown = client.patch("/api/v1/data-requests/dsr-nope", json={"status": "in_progress"}, headers=csrf(client))
    assert unknown.status_code == 404
    bad = client.patch("/api/v1/data-requests/dsr-ls-test-body", json={"status": "done", "x": 1}, headers=csrf(client))
    assert bad.status_code == 400
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/data-requests").status_code == 403
