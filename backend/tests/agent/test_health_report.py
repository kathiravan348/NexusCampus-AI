"""Unit tests for M84 outbound health reports (NEX-114) using fake HTTP transports."""

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from nexus.agent.health import ReportResult, probe_api, send_report
from nexus.agent.run import main
from nexus.control.fleet import HealthReport
from nexus.settings import Settings

EXPECTED_KEYS = {
    "at",
    "version",
    "uptimePct",
    "errorRatePct",
    "p95LatencyMs",
    "queueDepth",
    "diskUsedPct",
    "activeUsers",
}


class _ScalarResult:
    def __init__(self, value: int) -> None:
        self._value = value

    def scalar_one(self) -> int:
        return self._value


class _FakeConn:
    """Minimal SQLAlchemy Connection stub returning canned queueDepth and activeUsers counts."""

    def __init__(self, queue_depth: int = 2, active_users: int = 14) -> None:
        self._queue_depth = queue_depth
        self._active_users = active_users

    def execute(self, statement: Any, params: dict[str, Any] | None = None) -> _ScalarResult:
        sql = str(statement)
        if "nexus_install_active_users" in sql:
            return _ScalarResult(self._active_users)
        if "install_backups" in sql and "install_diagnostics" in sql:
            return _ScalarResult(self._queue_depth)
        raise AssertionError(f"Unexpected SQL in unit test: {sql}")


def _settings(tmp_path: Path, **over: Any) -> Settings:
    defaults: dict[str, Any] = {
        "install_mode": "self_hosted",
        "install_dir": tmp_path,
        "app_version": "2.4.2",
        "air_gapped": False,
        "telemetry_enabled": True,
        "control_url": "https://control.nexuscampus.example?secret=query-never-sent",
        "control_agent_token": SecretStr("agt-secret-token-do-not-print"),
        "agent_probe_url": "http://127.0.0.1:8000/healthz",
        "agent_probes": 20,
    }
    defaults.update(over)
    return Settings(**defaults)


def test_send_report_matches_contract_and_hides_token(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    probe_calls = 0

    def probe_handler(request: httpx2.Request) -> httpx2.Response:
        nonlocal probe_calls
        probe_calls += 1
        if probe_calls == 19:
            return httpx2.Response(503, request=request)
        if probe_calls == 20:
            raise httpx2.ConnectError("refused", request=request)
        return httpx2.Response(200, json={"status": "ok"}, request=request)

    captured: list[httpx2.Request] = []

    def control_handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(request)
        return httpx2.Response(204, request=request)

    cfg = _settings(tmp_path)
    now = datetime(2026, 11, 22, 10, 30, 0, tzinfo=UTC)
    result = send_report(
        _FakeConn(queue_depth=3, active_users=27),  # type: ignore[arg-type]
        cfg,
        now=now,
        probe_transport=httpx2.MockTransport(probe_handler),
        control_transport=httpx2.MockTransport(control_handler),
    )

    assert result == ReportResult(sent=True, message="sent")
    assert probe_calls == 20
    assert len(captured) == 1
    req = captured[0]
    assert req.method == "POST"
    assert str(req.url) == "https://control.nexuscampus.example/control/api/v1/agent/health"
    assert req.headers["authorization"] == "Bearer agt-secret-token-do-not-print"

    body = json.loads(req.content)
    assert set(body.keys()) == EXPECTED_KEYS
    assert "deploymentId" not in body
    validated = HealthReport.model_validate_json(req.content)
    assert validated.at == "2026-11-22T10:30:00Z"
    assert validated.version == "2.4.2"
    assert validated.uptime_pct == 95.0
    assert validated.error_rate_pct == 10.0
    assert validated.p95_latency_ms >= 0
    assert validated.queue_depth == 3
    assert validated.active_users == 27
    assert 0.0 <= validated.disk_used_pct <= 100.0

    print(f"health report: {result.message}")
    out = capsys.readouterr()
    for secret in ("agt-secret-token-do-not-print", "query-never-sent"):
        assert secret not in result.message
        assert secret not in out.out
        assert secret not in out.err


@pytest.mark.parametrize(
    ("overrides", "expected_fragment"),
    [
        ({"air_gapped": True}, "air-gapped"),
        ({"telemetry_enabled": False}, "telemetry"),
        ({"control_agent_token": SecretStr("")}, "token"),
        ({"control_agent_token": SecretStr("   ")}, "token"),
    ],
)
def test_no_request_when_air_gapped_telemetry_off_or_no_token(
    tmp_path: Path,
    overrides: dict[str, Any],
    expected_fragment: str,
) -> None:
    def forbid_network(request: httpx2.Request) -> httpx2.Response:
        raise AssertionError(f"Network request must not be made: {request.url}")

    transport = httpx2.MockTransport(forbid_network)
    cfg = _settings(tmp_path, **overrides)
    result = send_report(
        _FakeConn(),  # type: ignore[arg-type]
        cfg,
        probe_transport=transport,
        control_transport=transport,
    )
    assert result.sent is False
    assert expected_fragment in result.message
    assert "agt-secret-token-do-not-print" not in result.message


@pytest.mark.parametrize(
    ("outcome", "expected_fragment"),
    [
        (401, "401"),
        (403, "403"),
        (429, "429"),
        (502, "502"),
        ("timeout", "timed out"),
        ("connect", "could not reach"),
    ],
)
def test_errors_and_timeouts_reported_not_raised_without_leaking_token(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    outcome: int | str,
    expected_fragment: str,
) -> None:
    ok_probe = httpx2.MockTransport(lambda req: httpx2.Response(200, request=req))

    def control_handler(request: httpx2.Request) -> httpx2.Response:
        if outcome == "timeout":
            raise httpx2.ReadTimeout("timed out on https://control.example?secret=query-never-sent", request=request)
        if outcome == "connect":
            raise httpx2.ConnectError("connection refused", request=request)
        return httpx2.Response(int(outcome), request=request)

    cfg = _settings(tmp_path, agent_probes=2)
    with caplog.at_level(logging.DEBUG):
        result = send_report(
            _FakeConn(),  # type: ignore[arg-type]
            cfg,
            probe_transport=ok_probe,
            control_transport=httpx2.MockTransport(control_handler),
        )
    assert result.sent is False
    assert "\n" not in result.message
    assert expected_fragment in result.message
    for secret in ("agt-secret-token-do-not-print", "query-never-sent"):
        assert secret not in result.message
        assert secret not in caplog.text


def test_probe_all_failures_clamps_ranges() -> None:
    def fail_probe(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ReadTimeout("slow", request=request)

    summary = probe_api("http://127.0.0.1:8000/healthz", 5, transport=httpx2.MockTransport(fail_probe))
    assert (summary.uptime_pct, summary.error_rate_pct, summary.p95_latency_ms) == (0.0, 100.0, 0)


def test_cli_report_mode_skips_cleanly_without_token_or_network(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cfg = _settings(tmp_path, air_gapped=True)
    monkeypatch.setattr("nexus.agent.run.get_settings", lambda: cfg)
    monkeypatch.setattr("sys.argv", ["nexus-agent", "report"])
    main()
    out = capsys.readouterr()
    assert "air-gapped" in out.out
    assert "agt-secret-token-do-not-print" not in out.out
    assert "agt-secret-token-do-not-print" not in out.err
