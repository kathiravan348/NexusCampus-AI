"""DB tests for M84 agent `access_request.file` commands and M83 decision sync (NEX-131)."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text

from nexus.agent.commands import COMMAND_KEYS, poll_commands, report_access_decisions
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.vault import FakeVault
from nexus.settings import Settings
from tests.db.conftest import DbUrls

TENANT = "ten-ls"


def _utc(dt: datetime) -> str:
    return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _signed_file_cmd(
    vault: FakeVault,
    now: datetime,
    *,
    request_id: str,
    tenant_id: str = TENANT,
    modules: list[str] | None = None,
    duration_hours: int = 12,
    cmd_id: str | None = None,
) -> tuple[str, str, str]:
    cid = cmd_id or new_command_id()
    cmd = CommandPayload(
        id=cid,
        deployment_id="dep-in-1",
        tenant_id=tenant_id,
        kind="access_request.file",
        args={
            "requestId": request_id,
            "tenantId": tenant_id,
            "staffRef": "stf-0042",
            "staffDisplayName": "Alex Morgan (Nexus Support)",
            "reason": "Inspect notification templates for ticket 0915.",
            "modules": modules if modules is not None else ["M07"],
            "mode": "read",
            "durationHours": duration_hours,
        },
        issued_at=_utc(now),
        expires_at=_utc(now + timedelta(hours=24)),
        issued_by="stf-0042",
        signing_key_id=f"{DEFAULT_KEY}:v0",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, cmd)
    return cid, raw, sig


@pytest.mark.anyio
async def test_access_request_command_filing_validation_and_decision_reporting(test_db: DbUrls, tmp_path: Path) -> None:
    owner_eng = create_engine(test_db.owner_url)
    try:
        with owner_eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO tenants (id, name, type, region) "
                    "VALUES (:t, 'Little Steps', 'ey', 'in') ON CONFLICT (id) DO NOTHING"
                ),
                {"t": TENANT},
            )
    finally:
        owner_eng.dispose()

    vault = FakeVault()
    now = datetime.now(UTC).replace(microsecond=0)
    req_id = "acr-cmd-1001"
    c_ok, raw_ok, sig_ok = await _signed_file_cmd(vault, now, request_id=req_id)
    c_m83, raw_m83, sig_m83 = await _signed_file_cmd(vault, now, request_id="acr-bad-m83", modules=["M83"])
    c_hrs, raw_hrs, sig_hrs = await _signed_file_cmd(vault, now, request_id="acr-bad-hrs", duration_hours=99)
    c_tnt, raw_tnt, sig_tnt = await _signed_file_cmd(vault, now, request_id="acr-bad-tnt", tenant_id="ten-missing")

    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")
    cfg = Settings(
        install_mode="saas",
        region="in",
        deployment_id="dep-in-1",
        install_dir=tmp_path,
        control_url="https://control.nexuscampus.example",
        control_agent_token=SecretStr("agent-test-token-value"),
        database_url=SecretStr(test_db.app_url),
        migrate_database_url=SecretStr(test_db.owner_url),
    )

    items = [
        {"command": raw_ok, "signature": sig_ok},
        {"command": raw_m83, "signature": sig_m83},
        {"command": raw_hrs, "signature": sig_hrs},
        {"command": raw_tnt, "signature": sig_tnt},
    ]
    cmd_results: dict[str, dict[str, Any]] = {}
    decision_posts: list[dict[str, Any]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET":
            return httpx2.Response(200, json={"items": items})
        if req.url.path.endswith("/access-decisions"):
            body = json.loads(req.content)
            decision_posts.append(body)
            return httpx2.Response(200, json={"updated": len(body["items"]), "ignored": 0})
        cid = req.url.path.split("/")[-2]
        cmd_results[cid] = json.loads(req.content)
        return httpx2.Response(200, json={"id": cid, "status": cmd_results[cid]["status"]})

    app_eng = create_engine(test_db.app_url)
    try:
        res = poll_commands(app_eng, cfg, now=now + timedelta(seconds=1), transport=httpx2.MockTransport(handler))
        assert res.done == 1 and res.rejected == 2 and res.failed == 1
        assert cmd_results[c_ok] == {"status": "done", "result": {"requestId": req_id}}
        assert cmd_results[c_m83]["status"] == "rejected"
        assert cmd_results[c_hrs]["status"] == "rejected"
        assert cmd_results[c_tnt] == {"status": "failed", "result": {"reason": "unknown_tenant"}}

        # Verify exactly one pending row and one audit event in Little Steps M83 inbox
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT})
            row = conn.execute(
                text("SELECT id, status, modules FROM access_requests WHERE id = :id"), {"id": req_id}
            ).first()
            assert row is not None and row.status == "pending" and list(row.modules) == ["M07"]
            aud = conn.execute(
                text("SELECT count(*) FROM audit_events WHERE target_id = :id AND action = 'm83.accessRequest.filed'"),
                {"id": req_id},
            ).scalar_one()
            assert aud == 1
            bad_rows = conn.execute(
                text("SELECT count(*) FROM access_requests WHERE id IN ('acr-bad-m83', 'acr-bad-hrs')")
            ).scalar_one()
            assert bad_rows == 0

        # Replay with a new command id carrying the same request_id is idempotent (no second row/audit)
        _, raw_rep, sig_rep = await _signed_file_cmd(vault, now, request_id=req_id)
        items[:] = [{"command": raw_rep, "signature": sig_rep}]
        res_rep = poll_commands(app_eng, cfg, now=now + timedelta(seconds=2), transport=httpx2.MockTransport(handler))
        assert res_rep.done == 1
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT})
            aud2 = conn.execute(
                text("SELECT count(*) FROM audit_events WHERE target_id = :id AND action = 'm83.accessRequest.filed'"),
                {"id": req_id},
            ).scalar_one()
            assert aud2 == 1

        # Pending request reports no decisions yet
        assert decision_posts == []

        # Simulate institution admin approving in M83 -> next run reports approved once (no reason/modules leaked!)
        approved_at = now + timedelta(minutes=2)
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT})
            conn.execute(
                text(
                    "UPDATE access_requests SET status = 'approved', decided_at = :at, "
                    "decided_by = 'usr-ls-admin' WHERE id = :id"
                ),
                {"at": approved_at, "id": req_id},
            )
            conn.execute(
                text(
                    "INSERT INTO access_grants (id, tenant_id, request_id, modules, mode, starts_at, ends_at) "
                    "VALUES ('grt-cmd-1001', :t, :rid, ARRAY['M07'], 'read', :s, :e)"
                ),
                {"t": TENANT, "rid": req_id, "s": approved_at, "e": approved_at + timedelta(hours=12)},
            )
        assert report_access_decisions(app_eng, cfg, now=approved_at, transport=httpx2.MockTransport(handler)) == 1
        assert len(decision_posts) == 1
        sent_item = decision_posts[0]["items"][0]
        assert set(sent_item.keys()) == {"requestId", "status", "decidedAt"}
        assert sent_item["requestId"] == req_id and sent_item["status"] == "approved"
        assert "Inspect notification" not in json.dumps(decision_posts[0])
        # Second run does not re-report approved
        assert report_access_decisions(app_eng, cfg, now=approved_at, transport=httpx2.MockTransport(handler)) == 0

        # Admin revokes grant -> reported once more
        revoked_at = now + timedelta(minutes=5)
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT})
            conn.execute(
                text("UPDATE access_requests SET status = 'revoked', decided_at = :at WHERE id = :id"),
                {"at": revoked_at, "id": req_id},
            )
            conn.execute(
                text("UPDATE access_grants SET revoked_at = :at WHERE id = 'grt-cmd-1001'"),
                {"at": revoked_at},
            )
        assert report_access_decisions(app_eng, cfg, now=revoked_at, transport=httpx2.MockTransport(handler)) == 1
        assert decision_posts[-1]["items"][0]["status"] == "revoked"
        assert report_access_decisions(app_eng, cfg, now=revoked_at, transport=httpx2.MockTransport(handler)) == 0
    finally:
        app_eng.dispose()
