"""Control P04 offboarding writes, four-eyes key destruction, and signed shred certificates (D61, NEX-134)."""

import json
import logging
from typing import Any

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy import create_engine, text

from nexus.agent.tenant_export import pem_fingerprint
from nexus.commands.format import load_public_keys
from nexus.control.offboarding import verify_shred_certificate
from nexus.control.provisioning import OffboardingJob, ShredCertificate
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, SALES, IMPL = "stf-0001", "stf-0011", "stf-0023"


def _rsa_pem(bits: int) -> str:
    priv = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    return priv.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


def _issue_agent_token(owner_url: str, deployment_id: str) -> str:
    return issue_token(owner_url, deployment_id)


def _cleanup(owner_url: str, job_ids: list[str], cert_ids: list[str]) -> None:
    eng = create_engine(owner_url)
    try:
        with eng.begin() as conn:
            for jid in job_ids:
                conn.execute(text("DELETE FROM offboarding_jobs WHERE id = :id"), {"id": jid})
            for cid in cert_ids:
                conn.execute(text("DELETE FROM shred_certificates WHERE id = :id"), {"id": cid})
            conn.execute(text("DELETE FROM deployment_commands WHERE kind LIKE 'tenant.%'"))
    finally:
        eng.dispose()


@pytest.mark.anyio
async def test_offboarding_flow_four_eyes_and_signed_shred_certificate(
    api: httpx2.AsyncClient, control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner_url, _ = control_db
    dep_token = _issue_agent_token(owner_url, "dep-in-1")
    pem = _rsa_pem(3072)
    pem_sha = pem_fingerprint(pem)
    job_ids: list[str] = []
    cert_ids: list[str] = []

    try:
        # Permission check: sales cannot start offboarding
        no_perm = await api.post(
            f"{API}/offboarding-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": pem},
            headers={"X-Nexus-Staff": SALES},
        )
        assert no_perm.status_code == 403

        # Weak RSA key (< 3072) refused
        weak = await api.post(
            f"{API}/offboarding-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": _rsa_pem(2048)},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert weak.status_code == 400

        # Unknown tenant on account -> 404
        wrong_ten = await api.post(
            f"{API}/offboarding-jobs",
            json={"accountId": "acc-ls", "tenantId": "ten-ax", "recipientPem": pem},
            headers={"X-Nexus-Staff": IMPL},
        )
        assert wrong_ten.status_code == 404

        # Start offboarding on acc-ls / ten-ls (shared IN cell dep-in-1)
        with caplog.at_level(logging.INFO, logger="nexus.control.offboarding"):
            created = await api.post(
                f"{API}/offboarding-jobs",
                json={"accountId": "acc-ls", "tenantId": "ten-ls", "recipientPem": pem},
                headers={"X-Nexus-Staff": IMPL},
            )
        assert created.status_code == 201, created.text
        job = created.json()
        OffboardingJob.model_validate(job)
        job_id = job["id"]
        job_ids.append(job_id)
        assert job["status"] == "running" and job["shredCertificateId"] is None
        assert [s["status"] for s in job["steps"]] == ["running", "pending", "pending", "pending", "pending"]

        # Confirm-download and approve-destroy out of order -> 409
        assert (
            await api.post(f"{API}/offboarding-jobs/{job_id}/confirm-download", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409
        assert (
            await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409

        # Agent fetches tenant.freeze command and reports done -> Control queues tenant.export
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        cmds = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {dep_token}"})).json()[
            "items"
        ]
        freeze_payload = json.loads(cmds[-1]["command"])
        assert freeze_payload["kind"] == "tenant.freeze" and freeze_payload["args"] == {"tenantId": "ten-ls"}
        r_frz = await api.post(
            f"{API}/agent/commands/{freeze_payload['id']}/result",
            json={"status": "done", "result": {"tenantId": "ten-ls", "frozenAt": "2026-11-23T06:00:00Z"}},
            headers={"Authorization": f"Bearer {dep_token}"},
        )
        assert r_frz.status_code == 200

        after_frz = (await api.get(f"{API}/offboarding-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()
        OffboardingJob.model_validate(after_frz)
        assert [s["status"] for s in after_frz["steps"]] == ["done", "running", "pending", "pending", "pending"]

        # Agent fetches tenant.export command and reports done
        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        cmds = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {dep_token}"})).json()[
            "items"
        ]
        exp_payload = json.loads(cmds[-1]["command"])
        assert exp_payload["kind"] == "tenant.export" and exp_payload["args"]["recipientPem"] == pem.strip()
        r_exp = await api.post(
            f"{API}/agent/commands/{exp_payload['id']}/result",
            json={
                "status": "done",
                "result": {
                    "fileName": "exp-test.nxte",
                    "bytes": 4096,
                    "pemSha256": pem_sha,
                    "tables": 40,
                    "rows": 80,
                },
            },
            headers={"Authorization": f"Bearer {dep_token}"},
        )
        assert r_exp.status_code == 200

        after_exp = (await api.get(f"{API}/offboarding-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()
        OffboardingJob.model_validate(after_exp)
        assert [s["status"] for s in after_exp["steps"]] == ["done", "done", "pending", "pending", "pending"]

        # Approve destroy before confirm-download -> 409
        assert (
            await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        ).status_code == 409

        # Confirm download -> export_downloaded = done
        conf = await api.post(f"{API}/offboarding-jobs/{job_id}/confirm-download", headers={"X-Nexus-Staff": IMPL})
        assert conf.status_code == 200
        OffboardingJob.model_validate(conf.json())
        assert [s["status"] for s in conf.json()["steps"]] == ["done", "done", "done", "pending", "pending"]

        # First approver records approver 1 (no destroy command queued yet)
        ap1 = await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        assert ap1.status_code == 200
        OffboardingJob.model_validate(ap1.json())
        assert [s["status"] for s in ap1.json()["steps"]] == ["done", "done", "done", "pending", "pending"]

        # Same staff member approving twice -> 409
        ap_dup = await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": IMPL})
        assert ap_dup.status_code == 409

        # Second distinct staff member approves -> queues tenant.destroy_keys with both ids + pemSha256
        ap2 = await api.post(f"{API}/offboarding-jobs/{job_id}/approve-destroy", headers={"X-Nexus-Staff": ADMIN})
        assert ap2.status_code == 200
        OffboardingJob.model_validate(ap2.json())
        assert [s["status"] for s in ap2.json()["steps"]] == ["done", "done", "done", "running", "pending"]

        api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
        cmds = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {dep_token}"})).json()[
            "items"
        ]
        dest_payload = json.loads(cmds[-1]["command"])
        assert dest_payload["kind"] == "tenant.destroy_keys"
        assert dest_payload["args"] == {
            "tenantId": "ten-ls",
            "exportPemSha256": pem_sha,
            "approvedBy": [IMPL, ADMIN],
        }

        # Agent reports keys destroyed -> Control signs & stores shred certificate, job done
        r_dest = await api.post(
            f"{API}/agent/commands/{dest_payload['id']}/result",
            json={
                "status": "done",
                "result": {"keyIds": ["key-ls-tenant-data"], "destroyedAt": "2026-11-23T06:05:12.456Z"},
            },
            headers={"Authorization": f"Bearer {dep_token}"},
        )
        assert r_dest.status_code == 200

        done_job = (await api.get(f"{API}/offboarding-jobs/{job_id}", headers={"X-Nexus-Staff": IMPL})).json()
        OffboardingJob.model_validate(done_job)
        assert done_job["status"] == "done" and done_job["shredCertificateId"] is not None
        assert [s["status"] for s in done_job["steps"]] == ["done", "done", "done", "done", "done"]
        cert_id = done_job["shredCertificateId"]
        cert_ids.append(cert_id)
        assert cert_id.startswith("shr-")

        # Fetch certificate + public keys (no auth on /shred-certificate-keys) and verify offline
        cert = (await api.get(f"{API}/shred-certificates/{cert_id}", headers={"X-Nexus-Staff": IMPL})).json()
        ShredCertificate.model_validate(cert)
        assert cert["signingKeyId"].startswith("nexus-shred:v") and len(cert["signature"]) == 88
        keys_resp = await api.get(f"{API}/shred-certificate-keys")
        assert keys_resp.status_code == 200
        pub_keys = load_public_keys(keys_resp.json())
        assert verify_shred_certificate(cert, pub_keys) is True

        # Tampering with any field fails verification
        for field, bad_val in (
            ("id", "shr-tampered"),
            ("tenantId", "ten-ax"),
            ("keyIds", ["key-ls-tenant-data", "key-extra"]),
            ("destroyedAt", "2026-11-23T06:05:13Z"),
        ):
            tampered: dict[str, Any] = {**cert, field: bad_val}
            assert verify_shred_certificate(tampered, pub_keys) is False, field

        # Logs never contain the PEM
        logged = "\n".join(r.getMessage() for r in caplog.records)
        assert "BEGIN PUBLIC KEY" not in logged and pem[:32] not in logged
    finally:
        _cleanup(owner_url, job_ids, cert_ids)
