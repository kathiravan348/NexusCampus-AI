"""An expired command fails the job step that waited for it, and staff can retry (D63, NEX-139)."""

import asyncio
import json
from typing import Any

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.agent.tenant_export import pem_fingerprint
from nexus.control.command_expiry import sweep_once
from nexus.control.settings import ControlSettings
from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, SUPPORT, IMPL = "stf-0001", "stf-0042", "stf-0023"
CFG = ControlSettings(environment="test")


def _sql(owner_url: str, sql: str, params: dict[str, Any] | None = None) -> Any:
    eng = create_engine(owner_url)
    try:
        with eng.begin() as conn:
            res = conn.execute(text(sql), params or {})
            return res.all() if res.returns_rows else None
    finally:
        eng.dispose()


def _age(owner_url: str, command_id: str) -> None:
    """Puts a command one hour past its expiry, as if its cell never ran it."""
    _sql(
        owner_url,
        "UPDATE deployment_commands SET issued_at = now() - interval '2 hours', "
        "expires_at = now() - interval '1 hour' WHERE id = :id",
        {"id": command_id},
    )


_JOB_COMMAND_SQL = {
    table: f"SELECT c.id, c.kind, c.payload FROM {table} j JOIN deployment_commands c ON c.id = j.command_id "  # noqa: S608
    "WHERE j.id = :id"
    for table in ("provisioning_jobs", "offboarding_jobs", "portability_jobs")
}


def _command_of(owner_url: str, table: str, job_id: str) -> tuple[str, str, dict[str, Any]]:
    """The job's current command: id, kind and signed args (`table` is one of three fixed names)."""
    rows = _sql(owner_url, _JOB_COMMAND_SQL[table], {"id": job_id})
    return str(rows[0].id), str(rows[0].kind), json.loads(rows[0].payload)["args"]


async def _sweep(app_url: str, vault: FakeVault) -> int:
    engine = create_async_engine(app_url)  # `control_app`: the grants the sweep loop runs with
    try:
        return await sweep_once(engine, vault, CFG)
    finally:
        await engine.dispose()


def _rsa_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    return key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


async def _answer(api: httpx2.AsyncClient, token: str, command_id: str, result: dict[str, Any]) -> None:
    res = await api.post(
        f"{API}/agent/commands/{command_id}/result",
        json={"status": "done", "result": result},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200, res.text


@pytest.mark.anyio
async def test_expired_provisioning_and_move_commands_fail_their_step_and_can_be_retried(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, app_url = control_db
    prov_id = move_id = None
    try:
        r_prov = await api.post(
            f"{API}/provisioning-jobs",
            headers={"X-Nexus-Staff": IMPL},
            json={
                "accountId": "acc-lt",
                "region": "in",
                "institutionType": "tp",
                "planCode": "standard",
                "trialDays": 14,
                "deliveryModel": "saas_shared",
            },
        )
        assert r_prov.status_code == 201, r_prov.text
        prov_id = r_prov.json()["id"]
        r_move = await api.post(
            f"{API}/portability-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert r_move.status_code == 201, r_move.text
        move_id = r_move.json()["id"]
        prov_cmd, _, _ = _command_of(owner, "provisioning_jobs", prov_id)
        move_cmd, move_kind, _ = _command_of(owner, "portability_jobs", move_id)
        assert move_kind == "tenant.import_key"

        # Nothing is overdue yet: the sweep touches no job.
        assert await _sweep(app_url, fake_vault) == 0
        _age(owner, prov_cmd)
        _age(owner, move_cmd)
        assert await _sweep(app_url, fake_vault) == 2
        assert await _sweep(app_url, fake_vault) == 0  # each row once

        prov = (await api.get(f"{API}/provisioning-jobs/{prov_id}", headers={"X-Nexus-Staff": IMPL})).json()
        assert prov["status"] == "failed" and prov["steps"][0] == {"name": "create_tenant", "status": "failed"}
        move = (await api.get(f"{API}/portability-jobs/{move_id}", headers={"X-Nexus-Staff": IMPL})).json()
        assert move["status"] == "failed" and move["steps"][0] == {"name": "preflight", "status": "failed"}

        # A person retries: each job gets a fresh signed command of the same kind.
        r1 = await api.post(f"{API}/provisioning-jobs/{prov_id}/retry", headers={"X-Nexus-Staff": IMPL})
        r2 = await api.post(f"{API}/portability-jobs/{move_id}/retry", headers={"X-Nexus-Staff": IMPL})
        assert r1.status_code == 200 and r2.status_code == 200
        new_prov, prov_kind, _ = _command_of(owner, "provisioning_jobs", prov_id)
        new_move, kind2, _ = _command_of(owner, "portability_jobs", move_id)
        assert new_prov != prov_cmd and prov_kind == "tenant.provision"
        assert new_move != move_cmd and kind2 == "tenant.import_key"
        statuses = _sql(
            owner, "SELECT id, status FROM deployment_commands WHERE id IN (:a, :b)", {"a": prov_cmd, "b": move_cmd}
        )
        assert {r.status for r in statuses} == {"expired"}
    finally:
        _sql(owner, "DELETE FROM provisioning_jobs WHERE id = :id", {"id": prov_id})
        _sql(owner, "DELETE FROM portability_jobs WHERE id = :id", {"id": move_id})
        _sql(owner, "DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'")


@pytest.mark.anyio
async def test_offboarding_steps_fail_on_expiry_and_retry_with_the_same_pem_and_approvals(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, app_url = control_db
    token = issue_token(owner, "dep-in-1")
    pem = _rsa_pem()
    job_id = None

    async def job() -> dict[str, Any]:
        res = await api.get(f"{API}/offboarding-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})
        return res.json()  # type: ignore[no-any-return]

    async def expire_and_retry(step: int) -> tuple[str, dict[str, Any]]:
        cmd, _, _ = _command_of(owner, "offboarding_jobs", str(job_id))
        _age(owner, cmd)
        assert await _sweep(app_url, fake_vault) == 1
        failed = await job()
        assert failed["status"] == "failed" and failed["steps"][step]["status"] == "failed"
        r = await api.post(f"{API}/offboarding-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
        assert r.status_code == 200, r.text
        assert r.json()["steps"][step]["status"] == "running" and r.json()["status"] == "running"
        new_cmd, kind, args = _command_of(owner, "offboarding_jobs", str(job_id))
        assert new_cmd != cmd
        return kind, {"id": new_cmd, **args}

    try:
        created = await api.post(
            f"{API}/offboarding-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": pem},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert created.status_code == 201, created.text
        job_id = created.json()["id"]
        # Only a failed job can be retried.
        assert (
            await api.post(f"{API}/offboarding-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409

        kind, freeze = await expire_and_retry(0)
        assert kind == "tenant.freeze" and freeze["tenantId"] == "ten-ls"
        await _answer(api, token, freeze["id"], {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"})

        kind, export = await expire_and_retry(1)
        assert kind == "tenant.export" and export["recipientPem"] == pem.strip()
        await _answer(api, token, export["id"], {"fileName": "e.nxte", "pemSha256": pem_fingerprint(pem), "rows": 9})
        kept = _sql(owner, "SELECT recipient_pem FROM offboarding_jobs WHERE id = :id", {"id": job_id})
        assert kept[0].recipient_pem is None  # dropped once the export succeeded

        await api.post(f"{API}/offboarding-jobs/{job_id}/confirm-download", headers={"X-Nexus-Staff": IMPL})
        await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        kind, destroy = await expire_and_retry(3)
        assert kind == "tenant.destroy_keys" and destroy["approvedBy"] == [IMPL, ADMIN]
        assert destroy["exportPemSha256"] == pem_fingerprint(pem)
    finally:
        _sql(owner, "DELETE FROM offboarding_jobs WHERE id = :id", {"id": job_id})
        _sql(owner, "DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'")


@pytest.mark.anyio
async def test_expired_access_request_command_expires_the_request_on_fetch_or_sweep(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, app_url = control_db
    token = issue_token(owner, "dep-in-1")
    body = {
        "accountId": "acc-ls",
        "tenantId": "ten-ls",
        "ticketId": None,
        "reason": "Check why notification templates fail to send.",
        "modules": ["M07"],
        "mode": "read",
        "durationHours": 4,
    }
    made: list[str] = []
    try:
        for _ in range(2):
            r = await api.post(f"{API}/broker-requests", headers={"X-Nexus-Staff": SUPPORT}, json=body)
            assert r.status_code == 201, r.text
            made.append(r.json()["id"])
        cmds = _sql(owner, "SELECT id, payload FROM deployment_commands WHERE kind = 'access_request.file'")
        by_request = {json.loads(c.payload)["args"]["requestId"]: str(c.id) for c in cmds}
        for rid in made:
            _age(owner, by_request[rid])

        # The agent's fetch expires its own overdue commands through the same path as the sweep.
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        fetched = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {token}"})
        assert fetched.status_code == 200 and fetched.json()["items"] == []
        rows = _sql(owner, "SELECT status, decided_at FROM broker_requests WHERE id = ANY(:ids)", {"ids": made})
        assert all(r.status == "expired" and r.decided_at is not None for r in rows)
        assert await _sweep(app_url, fake_vault) == 0
    finally:
        _sql(owner, "DELETE FROM broker_requests WHERE id = ANY(:ids)", {"ids": made})
        _sql(owner, "DELETE FROM deployment_commands WHERE kind = 'access_request.file'")


@pytest.mark.anyio
async def test_two_sweeps_at_once_handle_each_command_once(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, app_url = control_db
    jobs: list[str] = []
    try:
        for account in ("acc-lt", "acc-lt", "acc-lt"):
            r = await api.post(
                f"{API}/provisioning-jobs",
                headers={"X-Nexus-Staff": IMPL},
                json={
                    "accountId": account,
                    "region": "in",
                    "institutionType": "tp",
                    "planCode": "standard",
                    "trialDays": None,
                    "deliveryModel": "saas_shared",
                },
            )
            assert r.status_code == 201, r.text
            jobs.append(r.json()["id"])
            _age(owner, _command_of(owner, "provisioning_jobs", jobs[-1])[0])
        counts = await asyncio.gather(_sweep(app_url, fake_vault), _sweep(app_url, fake_vault))
        assert sum(counts) == 3
        failed = _sql(owner, "SELECT status FROM provisioning_jobs WHERE id = ANY(:ids)", {"ids": jobs})
        assert [r.status for r in failed] == ["failed"] * 3
    finally:
        _sql(owner, "DELETE FROM provisioning_jobs WHERE id = ANY(:ids)", {"ids": jobs})
        _sql(owner, "DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'")


@pytest.mark.anyio
async def test_a_job_that_cannot_move_on_does_not_block_the_expiry(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner, app_url = control_db
    job_id = None
    try:
        r = await api.post(
            f"{API}/provisioning-jobs",
            headers={"X-Nexus-Staff": IMPL},
            json={
                "accountId": "acc-lt",
                "region": "in",
                "institutionType": "tp",
                "planCode": "standard",
                "trialDays": None,
                "deliveryModel": "saas_shared",
            },
        )
        assert r.status_code == 201, r.text
        job_id = r.json()["id"]
        cmd = _command_of(owner, "provisioning_jobs", job_id)[0]
        _age(owner, cmd)

        async def broken(*_a: Any, **_kw: Any) -> None:
            raise RuntimeError("job handler failed")

        monkeypatch.setattr("nexus.control.command_expiry.apply_command_result", broken)
        assert await _sweep(app_url, fake_vault) == 1
        state = _sql(owner, "SELECT status FROM deployment_commands WHERE id = :id", {"id": cmd})
        assert state[0].status == "expired"  # the command still expires; the job error is logged by type
        job = _sql(owner, "SELECT status FROM provisioning_jobs WHERE id = :id", {"id": job_id})
        assert job[0].status == "pending"
    finally:
        _sql(owner, "DELETE FROM provisioning_jobs WHERE id = :id", {"id": job_id})
        _sql(owner, "DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'")
