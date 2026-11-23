"""Stage 2 command channel and key-custody security tests (V-2, V-6, D60, D61, NEX-110)."""

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.agent.commands import COMMAND_KEYS, poll_commands
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.control.commands import enqueue_command
from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token
from nexus.settings import BACKEND_ROOT, Settings

API = "/control/api/v1"
REPO = Path(BACKEND_ROOT).parent


def _sqlite_agent_db(tmp_path: Path) -> Any:
    eng = create_engine(f"sqlite:///{tmp_path / 'agent.db'}")
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE agent_commands (id TEXT PRIMARY KEY, kind TEXT NOT NULL, "
            "received_at TEXT NOT NULL, status TEXT NOT NULL, finished_at TEXT)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE broker_reports (request_id TEXT PRIMARY KEY, last_status TEXT, reported_at TEXT)"
        )
    return eng


async def _signed(vault: FakeVault, *, dep_id: str, kind: str, ttl_seconds: int = 3600) -> tuple[str, str, str]:
    now = datetime.now(UTC)
    cmd_id = new_command_id()
    payload = CommandPayload(
        id=cmd_id,
        deployment_id=dep_id,
        tenant_id=None,
        kind=kind,
        args={},
        issued_at=(now - timedelta(seconds=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        expires_at=(now + timedelta(seconds=ttl_seconds)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        issued_by="stf-0001",
        signing_key_id="placeholder",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, payload)
    return cmd_id, raw, sig


# --- V-6 / D60 Command channel integrity --------------------------------------------------------------------------


@pytest.mark.anyio
async def test_V6_D60_forged_replayed_expired_foreign_unknown_commands_never_run(tmp_path: Path) -> None:
    vault = FakeVault()
    await vault.create_signing_key(DEFAULT_KEY)
    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")

    eng = _sqlite_agent_db(tmp_path)
    cfg = Settings(
        install_mode="saas",
        deployment_id="dep-in-1",
        install_dir=tmp_path,
        control_url="https://control.nexuscampus.example",
        control_agent_token=SecretStr("tok-sec-test"),
    )
    executed: list[str] = []

    def track_ping(cmd: CommandPayload, _e: Any, _s: Settings) -> dict[str, Any]:
        executed.append(cmd.id)
        return {"version": "2.4.1"}

    try:
        good_id, good_raw, good_sig = await _signed(vault, dep_id="dep-in-1", kind="ping")
        _, foreign_raw, foreign_sig = await _signed(vault, dep_id="dep-eu-1", kind="ping")
        _, unknown_raw, unknown_sig = await _signed(vault, dep_id="dep-in-1", kind="shell.exec")
        # Forged signature (valid base64 64 zero bytes)
        forged_sig = base64.b64encode(b"\x00" * 64).decode("ascii")
        # Tampered payload (valid sig for good_raw, payload altered)
        tampered_raw = good_raw.replace('"ping"', '"pong"')
        # Expired command (signed in the past, verified at future `now`)
        _, exp_raw, exp_sig = await _signed(vault, dep_id="dep-in-1", kind="ping", ttl_seconds=60)

        items = [
            {"command": good_raw, "signature": forged_sig},
            {"command": tampered_raw, "signature": good_sig},
            {"command": foreign_raw, "signature": foreign_sig},
            {"command": unknown_raw, "signature": unknown_sig},
            {"command": good_raw, "signature": good_sig},
            {"command": good_raw, "signature": good_sig},  # replay in same batch
        ]
        reports: list[dict[str, Any]] = []

        def transport_fn(req: httpx2.Request) -> httpx2.Response:
            if req.method == "GET":
                return httpx2.Response(200, json={"items": items})
            reports.append(json.loads(req.content.decode("utf-8")))
            return httpx2.Response(200, json={"ok": True})

        res = poll_commands(eng, cfg, transport=httpx2.MockTransport(transport_fn), handlers={"ping": track_ping})
        assert executed == [good_id]  # ran strictly once
        assert res.done == 1 and res.rejected == 4 and res.skipped == 1

        # Expired command checked at now + 2 hours -> rejected, never runs
        reports.clear()
        items = [{"command": exp_raw, "signature": exp_sig}]
        res_exp = poll_commands(
            eng,
            cfg,
            now=datetime.now(UTC) + timedelta(hours=2),
            transport=httpx2.MockTransport(transport_fn),
            handlers={"ping": track_ping},
        )
        assert executed == [good_id]
        assert res_exp.rejected == 1 and reports[0]["result"]["reason"] == "expired"
    finally:
        eng.dispose()


@pytest.mark.anyio
async def test_V6_D60_stolen_agent_token_cannot_read_or_report_foreign_deployment(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    """Deployment A's bearer token can neither fetch Deployment B's commands nor post their results."""
    owner_url, _ = control_db
    tok_in = issue_token(owner_url, "dep-in-1")
    tok_eu = issue_token(owner_url, "dep-eu-1")
    tok_air = issue_token(owner_url, "dep-al")  # air-gapped deployment

    owner_eng = create_async_engine(owner_url)
    cmd_id = ""
    try:
        async with owner_eng.begin() as conn:
            cmd_id = await enqueue_command(
                conn, fake_vault, deployment_id="dep-eu-1", kind="ping", args={}, issued_by="stf-0001"
            )
        # dep-in-1 cannot see dep-eu-1's command
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        r_in = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_in}"})
        assert r_in.status_code == 200
        assert all(json.loads(i["command"])["id"] != cmd_id for i in r_in.json()["items"])

        # dep-in-1 cannot post a result for dep-eu-1's command -> 404
        r_forged = await api.post(
            f"{API}/agent/commands/{cmd_id}/result",
            json={"status": "done", "result": {"version": "9.9.9"}},
            headers={"Authorization": f"Bearer {tok_in}"},
        )
        assert r_forged.status_code == 404

        # Air-gapped deployment token gets 403 on fetch and result
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        assert (
            await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_air}"})
        ).status_code == 403
        assert (
            await api.post(
                f"{API}/agent/commands/{cmd_id}/result",
                json={"status": "done", "result": {}},
                headers={"Authorization": f"Bearer {tok_air}"},
            )
        ).status_code == 403

        # dep-eu-1 itself CAN read and report its own command
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        r_eu = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_eu}"})
        assert any(json.loads(i["command"])["id"] == cmd_id for i in r_eu.json()["items"])
    finally:
        if cmd_id:
            async with owner_eng.begin() as conn:
                await conn.execute(text("DELETE FROM deployment_commands WHERE id = :id"), {"id": cmd_id})
        await owner_eng.dispose()


def test_V6_D60_air_gapped_install_makes_zero_network_requests(tmp_path: Path) -> None:
    """Air-gapped installs never open any outbound HTTP connection."""
    eng = _sqlite_agent_db(tmp_path)
    cfg = Settings(
        install_mode="self_hosted",
        air_gapped=True,
        agent_commands="on",
        deployment_id="dep-al",
        install_dir=tmp_path,
        control_url="https://control.nexuscampus.example",
        control_agent_token=SecretStr("tok-air"),
    )

    def fail_if_called(_req: httpx2.Request) -> httpx2.Response:
        raise AssertionError("air-gapped install must never make a network request")

    try:
        res = poll_commands(eng, cfg, transport=httpx2.MockTransport(fail_if_called))
        assert "air-gapped" in res.message and res.fetched == 0
    finally:
        eng.dispose()


# --- V-2 Key custody in install scripts ---------------------------------------------------------------------------


def test_V2_openbao_policies_deny_export_and_revoke_root() -> None:
    """Both Compose stacks explicitly deny `transit/export/*` and revoke the OpenBao root token after setup."""
    scripts = (
        REPO / "deploy/compose/scripts/install.sh",
        REPO / "deploy/compose/scripts/install.ps1",
        REPO / "deploy/control/scripts/install.sh",
        REPO / "deploy/control/scripts/install.ps1",
    )
    for script in scripts:
        body = script.read_text(encoding="utf-8")
        assert 'path "transit/export/*" { capabilities = ["deny"] }' in body, script.name
        assert "token revoke -self" in body, script.name
