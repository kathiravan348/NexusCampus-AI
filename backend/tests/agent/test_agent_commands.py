"""Unit & fake-HTTP tests for M84 agent signed commands (D60, NEX-129)."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from sqlalchemy import Engine, create_engine, text

from nexus.agent.commands import COMMAND_KEYS, poll_commands
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.vault import FakeVault
from nexus.settings import Settings


def _utc(dt: datetime) -> str:
    return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sqlite_engine() -> Engine:
    eng = create_engine("sqlite:///:memory:")
    with eng.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE agent_commands ("
                "id TEXT PRIMARY KEY, kind TEXT NOT NULL, received_at TEXT NOT NULL, "
                "status TEXT NOT NULL, finished_at TEXT)"
            )
        )
    return eng


def _settings(tmp_path: Path, **overrides: Any) -> Settings:
    data: dict[str, Any] = {
        "install_mode": "saas",
        "install_dir": tmp_path,
        "deployment_id": "dep-in-1",
        "control_url": "https://control.nexuscampus.example",
        "control_agent_token": "tok-test-secret",
        "app_version": "2.4.1",
        "air_gapped": False,
    }
    data.update(overrides)
    return Settings(**data)


async def _make_signed(
    vault: FakeVault,
    now: datetime,
    *,
    deployment_id: str = "dep-in-1",
    kind: str = "ping",
    ttl: timedelta = timedelta(minutes=10),
    cmd_id: str | None = None,
) -> tuple[str, str, str]:
    cid = cmd_id or new_command_id()
    cmd = CommandPayload(
        id=cid,
        deployment_id=deployment_id,
        tenant_id=None,
        kind=kind,
        args={},
        issued_at=_utc(now),
        expires_at=_utc(now + ttl),
        issued_by="cli",
        signing_key_id=f"{DEFAULT_KEY}:v0",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, cmd)
    return cid, raw, sig


@pytest.mark.anyio
async def test_valid_ping_runs_once_and_skips_replay(tmp_path: Path) -> None:
    vault = FakeVault()
    now = datetime(2026, 11, 23, 12, 0, 0, tzinfo=UTC)
    cid, raw, sig = await _make_signed(vault, now)
    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")

    posted: list[tuple[str, dict[str, Any]]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET":
            return httpx2.Response(200, json={"items": [{"command": raw, "signature": sig}]})
        posted.append((req.url.path, json.loads(req.content)))
        return httpx2.Response(200, json={"id": cid, "status": "done"})

    eng = _sqlite_engine()
    try:
        cfg = _settings(tmp_path)
        res1 = poll_commands(eng, cfg, now=now + timedelta(seconds=5), transport=httpx2.MockTransport(handler))
        assert res1.done == 1 and res1.skipped == 0 and res1.rejected == 0
        assert posted == [
            (f"/control/api/v1/agent/commands/{cid}/result", {"status": "done", "result": {"version": "2.4.1"}})
        ]

        # Second run with the exact same id is skipped (never run twice)
        res2 = poll_commands(eng, cfg, now=now + timedelta(seconds=10), transport=httpx2.MockTransport(handler))
        assert res2.done == 0 and res2.skipped == 1
        assert len(posted) == 1
        assert "priya" not in res1.message.lower()
    finally:
        eng.dispose()


@pytest.mark.anyio
async def test_rejects_tampered_expired_wrong_dep_unknown_key_and_unknown_kind(tmp_path: Path) -> None:
    vault = FakeVault()
    other_vault = FakeVault()
    now = datetime(2026, 11, 23, 12, 0, 0, tzinfo=UTC)

    c_tamper, raw_t, sig_t = await _make_signed(vault, now)
    c_exp, raw_e, sig_e = await _make_signed(vault, now - timedelta(minutes=20), ttl=timedelta(minutes=5))
    c_dep, raw_d, sig_d = await _make_signed(vault, now, deployment_id="dep-eu-1")
    c_key, raw_k, sig_k = await _make_signed(other_vault, now)
    c_kind, raw_u, sig_u = await _make_signed(vault, now, kind="tenant.drop")

    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")

    items = [
        {"command": raw_t.replace('"cli"', '"evil"'), "signature": sig_t},
        {"command": raw_e, "signature": sig_e},
        {"command": raw_d, "signature": sig_d},
        {"command": raw_k, "signature": sig_k},
        {"command": raw_u, "signature": sig_u},
    ]
    reported: dict[str, dict[str, Any]] = {}

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET":
            return httpx2.Response(200, json={"items": items})
        cmd_id = req.url.path.split("/")[-2]
        reported[cmd_id] = json.loads(req.content)
        return httpx2.Response(200, json={"id": cmd_id, "status": "rejected"})

    eng = _sqlite_engine()
    try:
        res = poll_commands(eng, _settings(tmp_path), now=now, transport=httpx2.MockTransport(handler))
        assert res.fetched == 5 and res.rejected == 5 and res.done == 0
        assert reported[c_tamper]["status"] == "rejected"
        assert reported[c_exp]["status"] == "rejected" and reported[c_exp]["result"]["reason"] == "expired"
        assert reported[c_dep]["status"] == "rejected" and reported[c_dep]["result"]["reason"] == "wrong_deployment"
        assert reported[c_key]["status"] == "rejected"
        assert reported[c_kind]["status"] == "rejected" and reported[c_kind]["result"]["reason"] == "unknown_kind"
    finally:
        eng.dispose()


def test_skip_conditions_and_transport_guards(tmp_path: Path) -> None:
    calls = 0

    def fail_if_called(req: httpx2.Request) -> httpx2.Response:
        nonlocal calls
        calls += 1
        return httpx2.Response(302, headers={"Location": "https://evil.example/"})

    eng = _sqlite_engine()
    try:
        # Self-hosted defaults to off
        assert (
            poll_commands(
                eng, _settings(tmp_path, install_mode="self_hosted"), transport=httpx2.MockTransport(fail_if_called)
            ).fetched
            == 0
        )
        # Explicit off on saas
        assert (
            poll_commands(
                eng, _settings(tmp_path, agent_commands="off"), transport=httpx2.MockTransport(fail_if_called)
            ).fetched
            == 0
        )
        # Air-gapped
        assert (
            poll_commands(
                eng, _settings(tmp_path, air_gapped=True), transport=httpx2.MockTransport(fail_if_called)
            ).fetched
            == 0
        )
        # No token
        assert (
            poll_commands(
                eng, _settings(tmp_path, control_agent_token=""), transport=httpx2.MockTransport(fail_if_called)
            ).fetched
            == 0
        )
        # No keys file
        assert poll_commands(eng, _settings(tmp_path), transport=httpx2.MockTransport(fail_if_called)).fetched == 0

        # Add keys file, test plain HTTP to non-loopback -> refused with no request
        (tmp_path / COMMAND_KEYS).write_text(json.dumps({"nexus-command:v1": "A" * 44}), encoding="utf-8")
        res_http = poll_commands(
            eng,
            _settings(tmp_path, control_url="http://control.nexuscampus.example"),
            transport=httpx2.MockTransport(fail_if_called),
        )
        assert "invalid control URL" in res_http.message
        assert calls == 0

        # Redirect is refused (follow_redirects=False)
        res_redir = poll_commands(eng, _settings(tmp_path), transport=httpx2.MockTransport(fail_if_called))
        assert "redirected" in res_redir.message
        assert calls == 1
    finally:
        eng.dispose()
