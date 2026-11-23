"""Control P04 real provisioning writes, command result tracking, and retry tests (NEX-132)."""

from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text

from nexus.commands.format import DEFAULT_KEY, load_public_keys, public_key_file, verify_command
from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, IMPL, SALES = "stf-0001", "stf-0023", "stf-0011"


@pytest.mark.anyio
async def test_create_provisioning_job_guards_and_command_flow(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, _ = control_db
    req_lt: dict[str, Any] = {
        "accountId": "acc-lt",
        "region": "in",
        "institutionType": "tp",
        "planCode": "standard",
        "trialDays": 14,
        "deliveryModel": "saas_shared",
    }
    # Permission denied & missing account
    assert (
        await api.post(f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": SALES}, json=req_lt)
    ).status_code == 403
    assert (
        await api.post(
            f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": IMPL}, json={**req_lt, "accountId": "acc-missing"}
        )
    ).status_code == 404
    # Self-hosted, mismatched delivery model, no shared cell for 'us', and no exec/tech contact (acc-ls) -> 409
    assert (
        await api.post(
            f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": IMPL}, json={**req_lt, "accountId": "acc-ct"}
        )
    ).status_code == 409
    assert (
        await api.post(
            f"{API}/provisioning-jobs",
            headers={"X-Nexus-Staff": IMPL},
            json={**req_lt, "deliveryModel": "saas_dedicated"},
        )
    ).status_code == 409
    assert (
        await api.post(f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": IMPL}, json={**req_lt, "region": "us"})
    ).status_code == 409
    assert (
        await api.post(
            f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": IMPL}, json={**req_lt, "accountId": "acc-ls"}
        )
    ).status_code == 409

    # Create job for acc-lt (has executive contact + in shared cell dep-in-1)
    r_new = await api.post(f"{API}/provisioning-jobs", headers={"X-Nexus-Staff": IMPL}, json=req_lt)
    assert r_new.status_code == 201
    job = r_new.json()
    job_id = job["id"]
    assert job["status"] == "pending" and job["tenantId"] is None
    assert all(s["status"] == "pending" for s in job["steps"])

    # Manual advance stays unserved (404); retry of non-failed job -> 409
    assert (
        await api.post(f"{API}/provisioning-jobs/{job_id}/advance", headers={"X-Nexus-Staff": IMPL})
    ).status_code == 404
    assert (
        await api.post(f"{API}/provisioning-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
    ).status_code == 409

    # dep-in-1 fetches signed tenant.provision command with exact NEX-127 args
    tok = issue_token(owner, "dep-in-1")
    keys = load_public_keys(await public_key_file(fake_vault, DEFAULT_KEY))
    cmds = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok}"})).json()["items"]
    assert len(cmds) == 1
    cmd = verify_command(cmds[0]["command"], cmds[0]["signature"], keys)
    assert cmd.kind == "tenant.provision" and cmd.deployment_id == "dep-in-1"
    planned_tid = cmd.args["tenantId"]
    assert planned_tid.startswith("ten-") and cmd.args["owner"]["workEmail"] == "vijay@lotuscoaching.example"

    # Partial failure at step 3 (apply_profile): steps 1-2 done, tenantId appears on job AND account (once!)
    r_fail = await api.post(
        f"{API}/agent/commands/{cmd.id}/result",
        headers={"Authorization": f"Bearer {tok}"},
        json={
            "status": "failed",
            "result": {
                "tenantId": planned_tid,
                "stepsDone": ["create_tenant", "create_keys"],
                "failedStep": "apply_profile",
                "reason": "step_failed",
            },
        },
    )
    assert r_fail.status_code == 200
    j_failed = (await api.get(f"{API}/provisioning-jobs/{job_id}", headers={"X-Nexus-Staff": ADMIN})).json()
    assert j_failed["status"] == "failed" and j_failed["tenantId"] == planned_tid
    assert [s["status"] for s in j_failed["steps"]] == ["done", "done", "failed", "pending", "pending"]
    acc_after_step1 = (await api.get(f"{API}/accounts/acc-lt", headers={"X-Nexus-Staff": ADMIN})).json()
    assert acc_after_step1["tenantIds"] == [planned_tid]

    # Retry failed job -> queues fresh command with the SAME tenant id
    r_retry = await api.post(f"{API}/provisioning-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
    assert r_retry.status_code == 200
    assert r_retry.json()["status"] == "running"

    api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
    cmds2 = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok}"})).json()["items"]
    cmd2 = verify_command(cmds2[0]["command"], cmds2[0]["signature"], keys)
    assert cmd2.id != cmd.id and cmd2.args["tenantId"] == planned_tid

    # Second command finishes all 5 steps -> job done, tenantId still appears ONCE on account
    r_done = await api.post(
        f"{API}/agent/commands/{cmd2.id}/result",
        headers={"Authorization": f"Bearer {tok}"},
        json={
            "status": "done",
            "result": {
                "tenantId": planned_tid,
                "stepsDone": ["create_tenant", "create_keys", "apply_profile", "seed", "invite_owner"],
            },
        },
    )
    assert r_done.status_code == 200
    j_done = (await api.get(f"{API}/provisioning-jobs/{job_id}", headers={"X-Nexus-Staff": ADMIN})).json()
    assert j_done["status"] == "done" and all(s["status"] == "done" for s in j_done["steps"])
    acc_final = (await api.get(f"{API}/accounts/acc-lt", headers={"X-Nexus-Staff": ADMIN})).json()
    assert acc_final["tenantIds"] == [planned_tid]

    # Cleanup mutated account tenant_ids for test isolation
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(text("UPDATE accounts SET tenant_ids = ARRAY[]::text[] WHERE id = 'acc-lt'"))
            conn.execute(text("DELETE FROM provisioning_jobs WHERE id = :id"), {"id": job_id})
            conn.execute(text("DELETE FROM deployment_commands WHERE id IN (:a, :b)"), {"a": cmd.id, "b": cmd2.id})
    finally:
        eng.dispose()
