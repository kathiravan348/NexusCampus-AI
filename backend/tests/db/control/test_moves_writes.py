"""Control P18 portability move orchestration tests (D61, NEX-136)."""

import json
import logging
from typing import Any

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy import create_engine, text

from nexus.agent.tenant_export import pem_fingerprint
from nexus.control.provisioning import PortabilityJob
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, SALES, IMPL = "stf-0001", "stf-0011", "stf-0023"


def _rsa_pem() -> str:
    priv = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    return priv.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


async def _fetch_last_cmd(api: httpx2.AsyncClient, token: str) -> dict[str, Any]:
    api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
    res = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert items, "expected queued command"
    return json.loads(items[-1]["command"])  # type: ignore[no-any-return]


@pytest.mark.anyio
async def test_region_move_seven_steps_chain_failure_retry_and_shred_certificate(
    api: httpx2.AsyncClient, control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner_url, _ = control_db
    in_tok = issue_token(owner_url, "dep-in-1")
    eu_tok = issue_token(owner_url, "dep-eu-1")
    pem = _rsa_pem()
    sha = pem_fingerprint(pem)
    job_id = off_id = cert_id = None

    try:
        # Permission denied -> 403
        assert (
            await api.post(
                f"{API}/portability-jobs",
                json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"},
                headers={"X-Nexus-Staff": SALES},
            )
        ).status_code == 403

        # Same region move -> 422
        assert (
            await api.post(
                f"{API}/portability-jobs",
                json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "in"},
                headers={"X-Nexus-Staff": IMPL},
            )
        ).status_code == 422

        # Create region move in -> eu on acc-ls / ten-ls -> 201 with all 7 steps pending
        with caplog.at_level(logging.INFO, logger="nexus.control.moves"):
            created = await api.post(
                f"{API}/portability-jobs",
                json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"},
                headers={"X-Nexus-Staff": IMPL},
            )
        assert created.status_code == 201, created.text
        job = created.json()
        PortabilityJob.model_validate(job)
        job_id = job["id"]
        assert job["status"] == "pending" and all(s["status"] == "pending" for s in job["steps"])

        # Out-of-order confirm -> 409
        assert (
            await api.post(
                f"{API}/portability-jobs/{job_id}/confirm", json={"step": "transfer"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 409
        # Confirming cell-managed step -> 409
        assert (
            await api.post(
                f"{API}/portability-jobs/{job_id}/confirm",
                json={"step": "preflight", "pem": pem},
                headers={"X-Nexus-Staff": IMPL},
            )
        ).status_code == 409

        # 1. preflight: dep-eu-1 answers tenant.import_key -> Control queues tenant.freeze on dep-in-1
        c1 = await _fetch_last_cmd(api, eu_tok)
        assert c1["kind"] == "tenant.import_key"
        assert (
            await api.post(
                f"{API}/agent/commands/{c1['id']}/result",
                json={"status": "done", "result": {"pem": pem, "pemSha256": sha}},
                headers={"Authorization": f"Bearer {eu_tok}"},
            )
        ).status_code == 200

        # 2. export_encrypted: dep-in-1 answers tenant.freeze -> Control queues tenant.export -> done
        c2 = await _fetch_last_cmd(api, in_tok)
        assert c2["kind"] == "tenant.freeze" and c2["args"] == {"tenantId": "ten-ls"}
        assert (
            await api.post(
                f"{API}/agent/commands/{c2['id']}/result",
                json={"status": "done", "result": {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"}},
                headers={"Authorization": f"Bearer {in_tok}"},
            )
        ).status_code == 200

        c3 = await _fetch_last_cmd(api, in_tok)
        assert c3["kind"] == "tenant.export"
        assert (
            await api.post(
                f"{API}/agent/commands/{c3['id']}/result",
                json={
                    "status": "done",
                    "result": {"fileName": "exp-ls.nxte", "bytes": 4096, "pemSha256": sha, "tables": 40, "rows": 81},
                },
                headers={"Authorization": f"Bearer {in_tok}"},
            )
        ).status_code == 200

        # 3. transfer: staff confirms -> Control queues tenant.import on dep-eu-1
        t_resp = await api.post(
            f"{API}/portability-jobs/{job_id}/confirm", json={"step": "transfer"}, headers={"X-Nexus-Staff": IMPL}
        )
        assert t_resp.status_code == 200
        PortabilityJob.model_validate(t_resp.json())

        # 4+5. import + verify: chainOk=False -> job fails at verify!
        c4 = await _fetch_last_cmd(api, eu_tok)
        assert c4["kind"] == "tenant.import" and c4["args"] == {
            "tenantId": "ten-ls",
            "fileName": "exp-ls.nxte",
            "pemSha256": sha,
            "expectedRows": 81,
        }
        assert (
            await api.post(
                f"{API}/agent/commands/{c4['id']}/result",
                json={
                    "status": "done",
                    "result": {
                        "tenantId": "ten-ls",
                        "rows": 81,
                        "checkpointsSkipped": 0,
                        "chainOk": False,
                        "checkpointOk": True,
                    },
                },
                headers={"Authorization": f"Bearer {eu_tok}"},
            )
        ).status_code == 200
        failed_job = (await api.get(f"{API}/portability-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()
        PortabilityJob.model_validate(failed_job)
        assert failed_job["status"] == "failed" and failed_job["steps"][4]["status"] == "failed"

        # Retry from failed step queues a fresh tenant.import -> succeeds with chainOk=True, checkpointOk=True
        retried = await api.post(f"{API}/portability-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
        assert retried.status_code == 200
        PortabilityJob.model_validate(retried.json())
        c5 = await _fetch_last_cmd(api, eu_tok)
        assert c5["kind"] == "tenant.import" and c5["id"] != c4["id"]
        assert (
            await api.post(
                f"{API}/agent/commands/{c5['id']}/result",
                json={
                    "status": "done",
                    "result": {
                        "tenantId": "ten-ls",
                        "rows": 81,
                        "checkpointsSkipped": 0,
                        "chainOk": True,
                        "checkpointOk": True,
                    },
                },
                headers={"Authorization": f"Bearer {eu_tok}"},
            )
        ).status_code == 200

        # 6. cutover: updates account region in -> eu once, starts linked offboarding job for source copy
        cut = await api.post(
            f"{API}/portability-jobs/{job_id}/confirm", json={"step": "cutover"}, headers={"X-Nexus-Staff": IMPL}
        )
        assert cut.status_code == 200
        PortabilityJob.model_validate(cut.json())
        assert cut.json()["steps"][5]["status"] == "done" and cut.json()["steps"][6]["status"] == "running"
        acc_after = (await api.get(f"{API}/accounts/acc-ls", headers={"X-Nexus-Staff": ADMIN})).json()
        assert acc_after["region"] == "eu" and acc_after["tenantIds"] == ["ten-ls"]

        # 7. shred_source waits for linked offboarding job's shred certificate (four-eyes)
        eng = create_engine(owner_url)
        try:
            with eng.connect() as conn:
                off_id = conn.execute(
                    text("SELECT offboarding_job_id FROM portability_jobs WHERE id = :id"), {"id": job_id}
                ).scalar_one()
        finally:
            eng.dispose()
        assert off_id is not None

        assert (
            await api.post(f"{API}/offboarding-jobs/{off_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        assert (
            await api.post(f"{API}/offboarding-jobs/{off_id}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        ).status_code == 200
        c6 = await _fetch_last_cmd(api, in_tok)
        assert c6["kind"] == "tenant.destroy_keys"
        assert (
            await api.post(
                f"{API}/agent/commands/{c6['id']}/result",
                json={
                    "status": "done",
                    "result": {"keyIds": ["key-ls-tenant-data"], "destroyedAt": "2026-11-23T06:30:00Z"},
                },
                headers={"Authorization": f"Bearer {in_tok}"},
            )
        ).status_code == 200

        done_off = (await api.get(f"{API}/offboarding-jobs/{off_id}", headers={"X-Nexus-Staff": IMPL})).json()
        cert_id = done_off["shredCertificateId"]
        assert done_off["status"] == "done" and cert_id is not None
        done_move = (await api.get(f"{API}/portability-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()
        PortabilityJob.model_validate(done_move)
        assert done_move["status"] == "done" and all(s["status"] == "done" for s in done_move["steps"])

        # Logs never contain PEM
        logged = "\n".join(r.getMessage() for r in caplog.records)
        assert "BEGIN PUBLIC KEY" not in logged
    finally:
        eng = create_engine(owner_url)
        try:
            with eng.begin() as conn:
                if job_id:
                    conn.execute(text("DELETE FROM portability_jobs WHERE id = :id"), {"id": job_id})
                if off_id:
                    conn.execute(text("DELETE FROM offboarding_jobs WHERE id = :id"), {"id": off_id})
                if cert_id:
                    conn.execute(text("DELETE FROM shred_certificates WHERE id = :id"), {"id": cert_id})
                conn.execute(text("DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'"))
                conn.execute(text("UPDATE accounts SET region = 'in' WHERE id = 'acc-ls'"))
        finally:
            eng.dispose()


@pytest.mark.anyio
async def test_saas_to_self_hosted_and_back_with_staff_confirmations(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner_url, _ = control_db
    in_tok = issue_token(owner_url, "dep-in-1")
    eu_tok = issue_token(owner_url, "dep-eu-1")
    pem = _rsa_pem()
    sha = pem_fingerprint(pem)
    mov1 = mov2 = off1 = cert1 = None

    try:
        # SaaS -> self-hosted on acc-ls / ten-ls
        r1 = await api.post(
            f"{API}/portability-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "saas_to_self_hosted", "toRegion": "in"},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert r1.status_code == 201
        mov1 = r1.json()["id"]
        # Staff supplies self-hosted PEM -> queues freeze + export on dep-in-1
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov1}/confirm",
                json={"step": "preflight", "pem": pem},
                headers={"X-Nexus-Staff": IMPL},
            )
        ).status_code == 200
        cf = await _fetch_last_cmd(api, in_tok)
        assert cf["kind"] == "tenant.freeze"
        await api.post(
            f"{API}/agent/commands/{cf['id']}/result",
            json={"status": "done", "result": {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"}},
            headers={"Authorization": f"Bearer {in_tok}"},
        )
        ce = await _fetch_last_cmd(api, in_tok)
        assert ce["kind"] == "tenant.export"
        await api.post(
            f"{API}/agent/commands/{ce['id']}/result",
            json={
                "status": "done",
                "result": {"fileName": "exp-sh.nxte", "bytes": 2048, "pemSha256": sha, "tables": 40, "rows": 50},
            },
            headers={"Authorization": f"Bearer {in_tok}"},
        )
        # Staff confirms transfer, import (with counts), cutover -> account becomes self_hosted with empty tenant_ids
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov1}/confirm", json={"step": "transfer"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov1}/confirm",
                json={"step": "import", "rows": 50},
                headers={"X-Nexus-Staff": IMPL},
            )
        ).status_code == 200
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov1}/confirm", json={"step": "cutover"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        acc_sh = (await api.get(f"{API}/accounts/acc-ls", headers={"X-Nexus-Staff": ADMIN})).json()
        assert acc_sh["deliveryModel"] == "self_hosted" and acc_sh["tenantIds"] == []

        eng = create_engine(owner_url)
        try:
            with eng.connect() as conn:
                off1 = conn.execute(
                    text("SELECT offboarding_job_id FROM portability_jobs WHERE id = :id"), {"id": mov1}
                ).scalar_one()
        finally:
            eng.dispose()
        await api.post(f"{API}/offboarding-jobs/{off1}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        await api.post(f"{API}/offboarding-jobs/{off1}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        cd = await _fetch_last_cmd(api, in_tok)
        await api.post(
            f"{API}/agent/commands/{cd['id']}/result",
            json={
                "status": "done",
                "result": {"keyIds": ["key-ls-tenant-data"], "destroyedAt": "2026-11-23T06:40:00Z"},
            },
            headers={"Authorization": f"Bearer {in_tok}"},
        )
        cert1 = (await api.get(f"{API}/offboarding-jobs/{off1}", headers={"X-Nexus-Staff": IMPL})).json()[
            "shredCertificateId"
        ]
        assert (await api.get(f"{API}/portability-jobs/{mov1}", headers={"X-Nexus-Staff": IMPL})).json()[
            "status"
        ] == "done"

        # Now move self_hosted -> saas (eu) back on the same account!
        r2 = await api.post(
            f"{API}/portability-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "self_hosted_to_saas", "toRegion": "eu"},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert r2.status_code == 201
        mov2 = r2.json()["id"]
        cik = await _fetch_last_cmd(api, eu_tok)
        assert cik["kind"] == "tenant.import_key"
        await api.post(
            f"{API}/agent/commands/{cik['id']}/result",
            json={"status": "done", "result": {"pem": pem, "pemSha256": sha}},
            headers={"Authorization": f"Bearer {eu_tok}"},
        )
        # Staff confirms export_encrypted (fileName + rows) and transfer -> queues tenant.import on dep-eu-1
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov2}/confirm",
                json={"step": "export_encrypted", "fileName": "exp-back.nxte", "rows": 50},
                headers={"X-Nexus-Staff": IMPL},
            )
        ).status_code == 200
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov2}/confirm", json={"step": "transfer"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        cimp = await _fetch_last_cmd(api, eu_tok)
        assert cimp["kind"] == "tenant.import"
        await api.post(
            f"{API}/agent/commands/{cimp['id']}/result",
            json={
                "status": "done",
                "result": {
                    "tenantId": "ten-ls",
                    "rows": 50,
                    "checkpointsSkipped": 0,
                    "chainOk": True,
                    "checkpointOk": True,
                },
            },
            headers={"Authorization": f"Bearer {eu_tok}"},
        )
        # Staff confirms cutover + shred_source (self-hosted source)
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov2}/confirm", json={"step": "cutover"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        assert (
            await api.post(
                f"{API}/portability-jobs/{mov2}/confirm", json={"step": "shred_source"}, headers={"X-Nexus-Staff": IMPL}
            )
        ).status_code == 200
        acc_back = (await api.get(f"{API}/accounts/acc-ls", headers={"X-Nexus-Staff": ADMIN})).json()
        assert (
            acc_back["deliveryModel"] == "saas_shared"
            and acc_back["region"] == "eu"
            and acc_back["tenantIds"] == ["ten-ls"]
        )
        final2 = (await api.get(f"{API}/portability-jobs/{mov2}", headers={"X-Nexus-Staff": IMPL})).json()
        PortabilityJob.model_validate(final2)
        assert final2["status"] == "done"
    finally:
        eng = create_engine(owner_url)
        try:
            with eng.begin() as conn:
                for mid in (mov1, mov2):
                    if mid:
                        conn.execute(text("DELETE FROM portability_jobs WHERE id = :id"), {"id": mid})
                if off1:
                    conn.execute(text("DELETE FROM offboarding_jobs WHERE id = :id"), {"id": off1})
                if cert1:
                    conn.execute(text("DELETE FROM shred_certificates WHERE id = :id"), {"id": cert1})
                conn.execute(text("DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'"))
                conn.execute(
                    text(
                        "UPDATE accounts SET delivery_model = 'saas_shared', region = 'in', "
                        "tenant_ids = ARRAY['ten-ls'] WHERE id = 'acc-ls'"
                    )
                )
        finally:
            eng.dispose()


@pytest.mark.anyio
async def test_region_move_checks_the_destination_pem_and_retries_a_failed_export(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner_url, _ = control_db
    in_tok = issue_token(owner_url, "dep-in-1")
    eu_tok = issue_token(owner_url, "dep-eu-1")
    pem = _rsa_pem()
    sha = pem_fingerprint(pem)
    job_id = None

    async def answer(token: str, cmd_id: str, status: str, result: dict[str, Any]) -> None:
        res = await api.post(
            f"{API}/agent/commands/{cmd_id}/result",
            json={"status": status, "result": result},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text

    async def job() -> dict[str, Any]:
        return (await api.get(f"{API}/portability-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()  # type: ignore[no-any-return]

    try:
        created = await api.post(
            f"{API}/portability-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "direction": "region_move", "toRegion": "eu"},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert created.status_code == 201, created.text
        job_id = created.json()["id"]

        # A PEM whose reported fingerprint is not its own fails preflight; a retry asks the cell again.
        c1 = await _fetch_last_cmd(api, eu_tok)
        await answer(eu_tok, c1["id"], "done", {"pem": pem, "pemSha256": "0" * 64})
        assert (await job())["steps"][0]["status"] == "failed"
        assert (
            await api.post(f"{API}/portability-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        c2 = await _fetch_last_cmd(api, eu_tok)
        assert c2["kind"] == "tenant.import_key" and c2["id"] != c1["id"]
        await answer(eu_tok, c2["id"], "done", {"pem": pem, "pemSha256": sha})

        # Freeze done, export failed: the retry re-queues freeze and then the export for the same PEM.
        c3 = await _fetch_last_cmd(api, in_tok)
        await answer(in_tok, c3["id"], "done", {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"})
        c4 = await _fetch_last_cmd(api, in_tok)
        assert c4["kind"] == "tenant.export"
        await answer(in_tok, c4["id"], "failed", {"reason": "db_error"})
        assert (await job())["status"] == "failed"
        assert (
            await api.post(f"{API}/portability-jobs/{job_id}/retry", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 200
        c5 = await _fetch_last_cmd(api, in_tok)
        assert c5["kind"] == "tenant.freeze"
        await answer(in_tok, c5["id"], "done", {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"})
        c6 = await _fetch_last_cmd(api, in_tok)
        assert c6["kind"] == "tenant.export" and c6["args"]["recipientPem"] == pem
        await answer(in_tok, c6["id"], "done", {"fileName": "exp-ls.nxte", "pemSha256": sha, "rows": 81})
        assert (await job())["steps"][1]["status"] == "done"
        eng = create_engine(owner_url)
        try:
            with eng.connect() as conn:
                kept = conn.execute(
                    text("SELECT recipient_pem FROM portability_jobs WHERE id = :id"), {"id": job_id}
                ).scalar_one()
                assert kept is None  # cleared once the export succeeded
        finally:
            eng.dispose()
    finally:
        eng = create_engine(owner_url)
        try:
            with eng.begin() as conn:
                if job_id:
                    conn.execute(text("DELETE FROM portability_jobs WHERE id = :id"), {"id": job_id})
                conn.execute(text("DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'"))
        finally:
            eng.dispose()
