"""P06 fleet API and outbound agent health check-in (NEX-113)."""

import json
import logging
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text

from nexus.control.fleet import HealthReport, derive_health
from nexus.control.seed import load_fixtures
from nexus.control.sessions import SESSION_COOKIE, DbSessionStore
from nexus.devtools.agent_token import issue_token, revoke_token

API = "/control/api/v1"
ADMIN, SUPPORT, SALES, PARTNER = "stf-0001", "stf-0042", "stf-0011", "stf-0051"
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


def sample_report(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "at": "2026-11-22T10:00:00Z",
        "version": "2.4.2",
        "uptimePct": 99.95,
        "errorRatePct": 0.1,
        "p95LatencyMs": 240,
        "queueDepth": 3,
        "diskUsedPct": 58.5,
        "activeUsers": 3100,
    }
    body.update(overrides)
    return body


@pytest.mark.anyio
async def test_lists_and_filters_match_fixtures(api: httpx2.AsyncClient) -> None:
    deps = (await get(api, ADMIN, "/deployments", pageSize=200)).json()
    assert deps["total"] == len(FIX.deployments)
    assert by_key(deps["items"], "id") == by_key(FIX.deployments, "id")

    sigs = (await get(api, SUPPORT, "/health-signals", pageSize=200)).json()
    assert sigs["total"] == len(FIX.health_signals)
    assert by_key(sigs["items"], "deploymentId") == by_key(FIX.health_signals, "deploymentId")

    # Filters and detail routes
    lts = (await get(api, ADMIN, "/deployments", channel="lts", pageSize=200)).json()["items"]
    assert {d["id"] for d in lts} == {d["id"] for d in FIX.deployments if d["channel"] == "lts"}
    in_self = (await get(api, ADMIN, "/deployments", kind="self_hosted", region="in", pageSize=200)).json()["items"]
    assert [d["id"] for d in in_self] == ["dep-ct"]
    degraded = (await get(api, ADMIN, "/deployments", health="degraded", pageSize=200)).json()["items"]
    assert [d["id"] for d in degraded] == ["dep-apac-1"]
    by_acc = (await get(api, ADMIN, "/deployments", accountId="acc-nb", pageSize=200)).json()["items"]
    assert [d["id"] for d in by_acc] == ["dep-us-nb"]

    assert (await get(api, ADMIN, "/deployments/dep-ct")).json()["id"] == "dep-ct"
    assert (await get(api, ADMIN, "/deployments/dep-missing")).status_code == 404
    one_sig = (await get(api, ADMIN, "/health-signals/dep-ct")).json()
    assert one_sig == next(s for s in FIX.health_signals if s["deploymentId"] == "dep-ct")
    filt_sig = (await get(api, ADMIN, "/health-signals", deploymentId="dep-ct")).json()["items"]
    assert filt_sig == [one_sig]

    # Deny by default
    assert (await get(api, SALES, "/deployments")).status_code == 403
    assert (await get(api, SALES, "/health-signals")).status_code == 403
    assert (await get(api, PARTNER, "/deployments")).status_code == 403
    assert (await api.get(f"{API}/deployments")).status_code == 401


@pytest.mark.anyio
async def test_partner_scoping_deployments_only_no_signals(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, _ = control_db
    # A partner-scoped staff user who also holds ctl.fleet.read sees only their accounts' deployments and no signals.
    engine = create_engine(owner)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                "VALUES ('stf-partner-fleet', 'Partner Fleet', 'pfleet@southern.example', ARRAY['partner', 'support'], "
                "'ptn-south', true, true) ON CONFLICT (id) DO NOTHING"
            )
        )
    engine.dispose()

    deps = (await get(api, "stf-partner-fleet", "/deployments", pageSize=200)).json()["items"]
    assert [d["id"] for d in deps] == ["dep-edge-ax"]
    assert (await get(api, "stf-partner-fleet", "/deployments/dep-edge-ax")).status_code == 200
    assert (await get(api, "stf-partner-fleet", "/deployments/dep-in-1")).status_code == 404
    assert (await get(api, "stf-partner-fleet", "/deployments/dep-ct")).status_code == 404

    sigs = (await get(api, "stf-partner-fleet", "/health-signals", pageSize=200)).json()
    assert sigs["total"] == 0 and sigs["items"] == []
    assert (await get(api, "stf-partner-fleet", "/health-signals/dep-edge-ax")).status_code == 404


@pytest.mark.anyio
async def test_agent_check_in_flow_rate_limit_and_token_hashing(
    api: httpx2.AsyncClient, control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner, _ = control_db
    token = issue_token(owner, "dep-ct")

    # Token is never stored in plain text in the database.
    engine = create_engine(owner)
    with engine.connect() as conn:
        stored = conn.execute(
            text("SELECT token_sha256, revoked_at FROM deployment_agent_tokens WHERE deployment_id = 'dep-ct'")
        ).one()
    engine.dispose()
    assert stored.token_sha256 != token
    assert len(stored.token_sha256) == 64 and stored.revoked_at is None
    assert token not in stored.token_sha256

    # Check-in succeeds (204), updates signal and deployment, derives health.
    caplog.set_level(logging.INFO, logger="nexus.control.fleet")
    report = sample_report(version="2.4.3", p95LatencyMs=1500)  # >= 1500 → degraded
    res = await api.post(f"{API}/agent/health", json=report, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 204
    assert any("dep-ct" in rec.message and "outcome=ok" in rec.message for rec in caplog.records)
    assert all(token not in rec.message and "2.4.3" not in rec.message for rec in caplog.records)

    dep = (await get(api, ADMIN, "/deployments/dep-ct")).json()
    assert dep["version"] == "2.4.3"
    assert dep["health"] == "degraded"
    assert dep["telemetryEnabled"] is True
    assert dep["lastCheckInAt"] != "2026-09-15T06:00:00Z"

    sig = (await get(api, ADMIN, "/health-signals/dep-ct")).json()
    assert sig["deploymentId"] == "dep-ct"
    assert sig["version"] == "2.4.3"
    assert sig["p95LatencyMs"] == 1500
    assert sig["activeUsers"] == 3100

    # Second report within 60 s → 429.
    again = await api.post(f"{API}/agent/health", json=sample_report(), headers={"Authorization": f"Bearer {token}"})
    assert again.status_code == 429

    # Re-issue replaces the old token; old token is now 401 and new token works after resetting last_check_in_at.
    new_token = issue_token(owner, "dep-ct")
    assert new_token != token
    old_res = await api.post(f"{API}/agent/health", json=sample_report(), headers={"Authorization": f"Bearer {token}"})
    assert old_res.status_code == 401

    engine = create_engine(owner)
    with engine.begin() as conn:
        conn.execute(text("UPDATE deployments SET last_check_in_at = '2026-09-15T06:00:00Z' WHERE id = 'dep-ct'"))
    engine.dispose()
    healthy = await api.post(
        f"{API}/agent/health",
        json=sample_report(
            at="2099-01-01T00:00:00Z", uptimePct=99, errorRatePct=1.99, p95LatencyMs=1499, diskUsedPct=89.9
        ),
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert healthy.status_code == 204
    after = (await get(api, ADMIN, "/deployments/dep-ct")).json()
    assert after["health"] == "healthy"
    # An install clock in the future is capped at the server's time.
    assert (await get(api, ADMIN, "/health-signals/dep-ct")).json()["at"] == after["lastCheckInAt"]


@pytest.mark.anyio
async def test_agent_check_in_rejects_bad_revoked_cookie_airgapped_extra_and_oversize(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, _ = control_db
    # Unknown token and revoked token give the exact same 401 answer.
    tok_nb = issue_token(owner, "dep-us-nb")
    assert revoke_token(owner, "dep-us-nb") is True
    unknown = await api.post(f"{API}/agent/health", json=sample_report(), headers={"Authorization": "Bearer nope"})
    revoked = await api.post(f"{API}/agent/health", json=sample_report(), headers={"Authorization": f"Bearer {tok_nb}"})
    assert unknown.status_code == 401 and revoked.status_code == 401
    assert unknown.json()["error"]["code"] == revoked.json()["error"]["code"] == "unauthorized"
    assert unknown.json()["error"]["message"] == revoked.json()["error"]["message"]

    # Staff cookie (a real session) or X-Nexus-Staff header alone → 401.
    _, app_url = control_db
    from sqlalchemy.ext.asyncio import create_async_engine

    async_eng = create_async_engine(app_url)
    try:
        real_cookie = await DbSessionStore(async_eng).create(ADMIN, 60)
    finally:
        await async_eng.dispose()
    cookie_only = await api.post(
        f"{API}/agent/health",
        json=sample_report(),
        headers={"Cookie": f"{SESSION_COOKIE}={real_cookie}", "X-Nexus-Staff": ADMIN},
    )
    assert cookie_only.status_code == 401

    # Air-gapped deployment → 403.
    tok_alpine = issue_token(owner, "dep-al")
    airgapped = await api.post(
        f"{API}/agent/health", json=sample_report(), headers={"Authorization": f"Bearer {tok_alpine}"}
    )
    assert airgapped.status_code == 403

    # Extra field (incl. deploymentId) → 422; > 4 KB → 413.
    tok_edge = issue_token(owner, "dep-edge-ax")
    extra = await api.post(
        f"{API}/agent/health",
        json=sample_report(deploymentId="dep-edge-ax"),
        headers={"Authorization": f"Bearer {tok_edge}"},
    )
    assert extra.status_code == 422
    other_extra = await api.post(
        f"{API}/agent/health",
        json=sample_report(hostname="school-srv-1"),
        headers={"Authorization": f"Bearer {tok_edge}"},
    )
    assert other_extra.status_code == 422

    big_payload = json.dumps(sample_report()) + (" " * 4096)
    too_big = await api.post(
        f"{API}/agent/health",
        content=big_payload.encode("utf-8"),
        headers={"Authorization": f"Bearer {tok_edge}", "Content-Type": "application/json"},
    )
    assert too_big.status_code == 413


def test_derive_health_thresholds() -> None:
    assert (
        derive_health(
            HealthReport.model_validate(
                sample_report(uptimePct=99, errorRatePct=1.99, p95LatencyMs=1499, diskUsedPct=89.9)
            )
        )
        == "healthy"
    )
    assert derive_health(HealthReport.model_validate(sample_report(uptimePct=98.99))) == "degraded"
    assert derive_health(HealthReport.model_validate(sample_report(errorRatePct=2))) == "degraded"
    assert derive_health(HealthReport.model_validate(sample_report(p95LatencyMs=1500))) == "degraded"
    assert derive_health(HealthReport.model_validate(sample_report(diskUsedPct=90))) == "degraded"


def test_control_app_cannot_write_tokens_or_delete(control_db: tuple[str, str]) -> None:
    from sqlalchemy.exc import ProgrammingError

    _, app_url = control_db
    engine = create_engine(app_url)
    try:
        for sql in (
            "INSERT INTO deployment_agent_tokens (deployment_id, token_sha256) VALUES ('dep-in-1', repeat('a', 64))",
            "DELETE FROM health_signals WHERE deployment_id = 'dep-in-1'",
            "DELETE FROM deployments WHERE id = 'dep-in-1'",
        ):
            with pytest.raises(ProgrammingError), engine.begin() as conn:
                conn.execute(text(sql))
    finally:
        engine.dispose()
