"""Tests for one open offboarding or portability move per tenant (D66, NEX-143)."""

import asyncio
import json
import logging
from typing import Any

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy import create_engine, text

from nexus.agent.tenant_export import pem_fingerprint
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, IMPL = "stf-0001", "stf-0023"
BUSY_MSG = "This tenant already has an offboarding or move in progress."


def _rsa_pem() -> str:
    priv = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    return priv.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


def _cmd_count(owner_url: str) -> int:
    eng = create_engine(owner_url)
    try:
        with eng.connect() as conn:
            return int(
                conn.execute(text("SELECT COUNT(*) FROM deployment_commands WHERE kind LIKE 'tenant.%'")).scalar_one()
            )
    finally:
        eng.dispose()


def _cleanup(owner_url: str) -> None:
    eng = create_engine(owner_url)
    try:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM portability_jobs WHERE tenant_id = 'ten-ls'"))
            conn.execute(text("DELETE FROM offboarding_jobs WHERE tenant_id = 'ten-ls'"))
            conn.execute(text("DELETE FROM shred_certificates WHERE tenant_id = 'ten-ls'"))
            conn.execute(text("DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'"))
            conn.execute(
                text(
                    "UPDATE accounts SET delivery_model = 'saas_shared', region = 'in', "
                    "tenant_ids = ARRAY['ten-ls'] WHERE id = 'acc-ls'"
                )
            )
    finally:
        eng.dispose()


async def _fetch_last_cmd(api: httpx2.AsyncClient, token: str) -> dict[str, Any]:
    api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
    res = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert items, "expected queued command"
    return json.loads(items[-1]["command"])  # type: ignore[no-any-return]


async def _answer(api: httpx2.AsyncClient, token: str, cmd_id: str, status: str, result: dict[str, Any]) -> None:
    res = await api.post(
        f"{API}/agent/commands/{cmd_id}/result",
        json={"status": status, "result": result},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text


@pytest.mark.anyio
async def test_busy_rules_for_create_and_retry(
    api: httpx2.AsyncClient, control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner_url, _ = control_db
    in_tok = issue_token(owner_url, "dep-in-1")
    eu_tok = issue_token(owner_url, "dep-eu-1")
    pem = _rsa_pem()
    sha = pem_fingerprint(pem)
    off_body = {"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": pem}
    mov_body = {"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"}

    try:
        r_off = await api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": IMPL})
        assert r_off.status_code == 201, r_off.text
        off1 = r_off.json()["id"]
        cmds_before = _cmd_count(owner_url)

        # Second offboarding and a move while off1 is open -> 409, nothing queued
        with caplog.at_level(logging.INFO, logger="nexus.control.tenant_jobs"):
            dup_off = await api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": IMPL})
            mov_during_off = await api.post(f"{API}/portability-jobs", json=mov_body, headers={"X-Nexus-Staff": IMPL})
        assert dup_off.status_code == 409 and dup_off.json()["error"]["message"] == BUSY_MSG
        assert mov_during_off.status_code == 409 and mov_during_off.json()["error"]["message"] == BUSY_MSG
        assert _cmd_count(owner_url) == cmds_before
        logged = "\n".join(r.getMessage() for r in caplog.records)
        assert f"tenant=ten-ls open_job={off1}" in logged and "outcome=busy" in logged
        assert "BEGIN PUBLIC KEY" not in logged

        # Fail off1 -> failed job does not block starting a move
        c_frz = await _fetch_last_cmd(api, in_tok)
        await _answer(api, in_tok, c_frz["id"], "failed", {"reason": "timeout"})
        r_mov = await api.post(f"{API}/portability-jobs", json=mov_body, headers={"X-Nexus-Staff": IMPL})
        assert r_mov.status_code == 201, r_mov.text
        mov1 = r_mov.json()["id"]
        cmds_after_mov = _cmd_count(owner_url)

        # While mov1 is pending: offboarding, second move, and retrying failed off1 -> all 409, nothing queued
        assert (
            await api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409
        assert (
            await api.post(f"{API}/portability-jobs", json=mov_body, headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409
        retry_off_busy = await api.post(f"{API}/offboarding-jobs/{off1}/retry", headers={"X-Nexus-Staff": IMPL})
        assert retry_off_busy.status_code == 409 and retry_off_busy.json()["error"]["message"] == BUSY_MSG
        assert _cmd_count(owner_url) == cmds_after_mov

        # Fail mov1 -> now retrying off1 works, and retrying mov1 while off1 is running -> 409
        c_ik = await _fetch_last_cmd(api, eu_tok)
        await _answer(api, eu_tok, c_ik["id"], "failed", {"reason": "vault_error"})
        assert (
            await api.post(f"{API}/offboarding-jobs/{off1}/retry", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        cmds_after_retry = _cmd_count(owner_url)
        retry_mov_busy = await api.post(f"{API}/portability-jobs/{mov1}/retry", headers={"X-Nexus-Staff": IMPL})
        assert retry_mov_busy.status_code == 409 and retry_mov_busy.json()["error"]["message"] == BUSY_MSG
        assert _cmd_count(owner_url) == cmds_after_retry

        # Complete off1 -> after it is done, a new move can start
        c2 = await _fetch_last_cmd(api, in_tok)
        await _answer(api, in_tok, c2["id"], "done", {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"})
        c3 = await _fetch_last_cmd(api, in_tok)
        await _answer(
            api,
            in_tok,
            c3["id"],
            "done",
            {"fileName": "exp-ls.nxte", "bytes": 1024, "pemSha256": sha, "tables": 40, "rows": 81},
        )
        assert (
            await api.post(f"{API}/offboarding-jobs/{off1}/confirm-download", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        assert (
            await api.post(f"{API}/offboarding-jobs/{off1}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        assert (
            await api.post(f"{API}/offboarding-jobs/{off1}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        ).status_code == 200
        c4 = await _fetch_last_cmd(api, in_tok)
        await _answer(
            api,
            in_tok,
            c4["id"],
            "done",
            {"keyIds": ["key-ls-tenant-data"], "destroyedAt": "2026-11-23T06:30:00Z"},
        )
        r_after_done = await api.post(f"{API}/portability-jobs", json=mov_body, headers={"X-Nexus-Staff": IMPL})
        assert r_after_done.status_code == 201, r_after_done.text
    finally:
        _cleanup(owner_url)


@pytest.mark.anyio
async def test_concurrent_creates_allow_exactly_one_201(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    owner_url, _ = control_db
    pem = _rsa_pem()
    off_body = {"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": pem}
    mov_body = {"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"}

    try:
        # Two offboarding creates at once -> exactly one 201 and one 409, one command queued
        r1, r2 = await asyncio.gather(
            api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": IMPL}),
            api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": ADMIN}),
        )
        assert sorted([r1.status_code, r2.status_code]) == [201, 409]
        assert _cmd_count(owner_url) == 1

        _cleanup(owner_url)

        # One offboarding and one move create at once -> exactly one 201 and one 409, one command queued
        r3, r4 = await asyncio.gather(
            api.post(f"{API}/offboarding-jobs", json=off_body, headers={"X-Nexus-Staff": IMPL}),
            api.post(f"{API}/portability-jobs", json=mov_body, headers={"X-Nexus-Staff": ADMIN}),
        )
        assert sorted([r3.status_code, r4.status_code]) == [201, 409]
        assert _cmd_count(owner_url) == 1
    finally:
        _cleanup(owner_url)


@pytest.mark.anyio
async def test_cell_source_move_reaches_done_through_linked_offboarding_including_retry(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner_url, _ = control_db
    in_tok = issue_token(owner_url, "dep-in-1")
    eu_tok = issue_token(owner_url, "dep-eu-1")
    pem = _rsa_pem()
    sha = pem_fingerprint(pem)

    try:
        r_mov = await api.post(
            f"{API}/portability-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert r_mov.status_code == 201, r_mov.text
        mov_id = r_mov.json()["id"]

        c1 = await _fetch_last_cmd(api, eu_tok)
        await _answer(api, eu_tok, c1["id"], "done", {"pem": pem, "pemSha256": sha})
        c2 = await _fetch_last_cmd(api, in_tok)
        await _answer(api, in_tok, c2["id"], "done", {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"})
        c3 = await _fetch_last_cmd(api, in_tok)
        await _answer(
            api,
            in_tok,
            c3["id"],
            "done",
            {"fileName": "exp-ls.nxte", "bytes": 2048, "pemSha256": sha, "tables": 40, "rows": 81},
        )
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov_id}/confirm", json={"step": "transfer"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        c4 = await _fetch_last_cmd(api, eu_tok)
        await _answer(
            api,
            eu_tok,
            c4["id"],
            "done",
            {"tenantId": "ten-ls", "rows": 81, "checkpointsSkipped": 0, "chainOk": True, "checkpointOk": True},
        )
        # Cutover inserts the move's own linked offboarding job without being blocked by the move itself.
        cut = await api.post(
            f"{API}/portability-jobs/{mov_id}/confirm", json={"step": "cutover"}, headers={"X-Nexus-Staff": IMPL}
        )
        assert cut.status_code == 200, cut.text

        eng = create_engine(owner_url)
        try:
            with eng.connect() as conn:
                off_id = str(
                    conn.execute(
                        text("SELECT offboarding_job_id FROM portability_jobs WHERE id = :id"), {"id": mov_id}
                    ).scalar_one()
                )
        finally:
            eng.dispose()

        # Approve key destruction; simulate failure once, then retry the linked offboarding -> still allowed!
        assert (
            await api.post(f"{API}/offboarding-jobs/{off_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        assert (
            await api.post(f"{API}/offboarding-jobs/{off_id}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        ).status_code == 200
        c5 = await _fetch_last_cmd(api, in_tok)
        await _answer(api, in_tok, c5["id"], "failed", {"reason": "transient"})
        assert (
            await api.post(f"{API}/offboarding-jobs/{off_id}/retry", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        c6 = await _fetch_last_cmd(api, in_tok)
        await _answer(
            api,
            in_tok,
            c6["id"],
            "done",
            {"keyIds": ["key-ls-tenant-data"], "destroyedAt": "2026-11-23T06:45:00Z"},
        )

        done_move = (await api.get(f"{API}/portability-jobs/{mov_id}", headers={"X-Nexus-Staff": IMPL})).json()
        assert done_move["status"] == "done" and all(s["status"] == "done" for s in done_move["steps"])
    finally:
        _cleanup(owner_url)
