"""P04 offboarding writes, four-eyes key destruction, and signed shred certificates (D61, NEX-134)."""

import base64
import logging
import secrets
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import APIRouter, Depends, Request
from pydantic import StringConstraints
from sqlalchemy import select, update

from nexus.agent.tenant_export import load_rsa_public_key, pem_fingerprint
from nexus.commands.format import public_key_file
from nexus.control.accounts import accounts
from nexus.control.commands import enqueue_command
from nexus.control.fleet import deployments
from nexus.control.provisioning import OFFBOARDING_JOBS, OffboardingJob, offboarding_jobs, shred_certificates
from nexus.control.resources import CamelModel, engine_of
from nexus.control.settings import ControlSettings
from nexus.control.staff import Id, utc_text
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.vault import Vault
from nexus.licensing.canonical import canonical_json
from nexus.licensing.licence import key_id

log = logging.getLogger("nexus.control.offboarding")
OFFB_STEPS = ("freeze_writes", "export_ready", "export_downloaded", "keys_destroyed", "certificate_issued")
router = APIRouter(prefix="/control/api/v1", tags=["P04 offboarding"])
ProvisionManager = Annotated[Viewer, Depends(require("ctl.provisioning.manage"))]


class OffboardingRequest(CamelModel):
    account_id: Id
    tenant_id: Id
    recipient_pem: Annotated[str, StringConstraints(strip_whitespace=True, min_length=64, max_length=1900)]


def shred_certificate_message(cert: Mapping[str, Any]) -> bytes:
    """Canonical JSON of `{id, tenantId, keyIds, destroyedAt}` covered by the Ed25519 signature."""
    return canonical_json(
        {
            "id": str(cert["id"]),
            "tenantId": str(cert["tenantId"]),
            "keyIds": list(cert["keyIds"]),
            "destroyedAt": str(cert["destroyedAt"]),
        }
    )


async def sign_shred_certificate(
    vault: Vault, key_name: str, *, cert_id: str, tenant_id: str, key_ids: list[str], destroyed_at: str
) -> tuple[str, str]:
    """Signs `{id, tenantId, keyIds, destroyedAt}` with OpenBao Transit Ed25519; returns `(signingKeyId, signature)`."""
    await vault.create_signing_key(key_name)
    version = max(await vault.public_keys(key_name))
    msg = shred_certificate_message(
        {"id": cert_id, "tenantId": tenant_id, "keyIds": key_ids, "destroyedAt": destroyed_at}
    )
    _, used, signature = (await vault.sign(key_name, msg)).split(":", 2)
    if used != f"v{version}":
        raise RuntimeError("shred signing key rotated while signing; retry")
    return key_id(key_name, version), signature


def verify_shred_certificate(cert: Mapping[str, Any], public_keys: Mapping[str, bytes]) -> bool:
    """Offline Ed25519 check of a `ShredCertificate` dict against `{keyId: raw32BytePubKey}`."""
    raw_pub, sig_b64 = public_keys.get(str(cert.get("signingKeyId") or "")), cert.get("signature")
    if raw_pub is None or not isinstance(sig_b64, str) or len(sig_b64) != 88:
        return False
    try:
        sig = base64.b64decode(sig_b64, validate=True)
        if len(sig) != 64:
            return False
        Ed25519PublicKey.from_public_bytes(raw_pub).verify(sig, shred_certificate_message(cert))
    except (InvalidSignature, KeyError, TypeError, ValueError):
        return False
    return True


def _steps_with(existing: list[dict[str, Any]] | None, **updates: str) -> tuple[list[dict[str, str]], str]:
    st = {str(s["name"]): str(s["status"]) for s in existing} if existing else dict.fromkeys(OFFB_STEPS, "pending")
    st.update(updates)
    steps = [{"name": n, "status": st[n]} for n in OFFB_STEPS]
    if all(s["status"] == "done" for s in steps):
        status = "done"
    elif any(s["status"] == "failed" for s in steps):
        status = "failed"
    elif any(s["status"] in ("running", "done") for s in steps):
        status = "running"
    else:
        status = "pending"
    return steps, status


def _parse_job(row: Mapping[Any, Any]) -> OffboardingJob:
    return OffboardingJob.model_validate(OFFBOARDING_JOBS.parse(row).model_dump())


async def _lock_job(conn: Any, job_id: str, viewer: Viewer) -> Mapping[Any, Any]:
    row = (
        (await conn.execute(select(offboarding_jobs).where(offboarding_jobs.c.id == job_id).with_for_update()))
        .mappings()
        .first()
    )
    if row is None or (viewer.account_ids is not None and row["account_id"] not in viewer.account_ids):
        raise ApiError(404, "not_found", "Offboarding job not found.")
    return dict(row)


async def _resolve_cell(conn: Any, account_id: str, delivery_model: str, region: str) -> str:
    if delivery_model == "self_hosted":
        raise ApiError(409, "conflict", "Self-hosted installs offboard themselves.")
    cond = (
        (deployments.c.account_id == account_id, deployments.c.kind == "saas_dedicated_cell")
        if delivery_model == "saas_dedicated"
        else (deployments.c.kind == "saas_shared_cell", deployments.c.region == region)
    )
    dep = (await conn.execute(select(deployments.c.id, deployments.c.air_gapped).where(*cond))).first()
    if dep is None or dep.air_gapped:
        raise ApiError(409, "conflict", "No reachable cell deployment is available for offboarding.")
    return str(dep.id)


@router.get("/shred-certificate-keys")
async def shred_certificate_keys(request: Request) -> dict[str, str]:
    """Public Ed25519 keys for offline verification of shred certificates (no auth required)."""
    vault: Vault = request.app.state.vault
    cfg: ControlSettings = request.app.state.settings
    await vault.create_signing_key(cfg.shred_signing_key)
    return await public_key_file(vault, cfg.shred_signing_key)


@router.post("/offboarding-jobs", response_model=OffboardingJob, response_model_by_alias=True, status_code=201)
async def create_offboarding_job(
    body: OffboardingRequest, request: Request, viewer: ProvisionManager
) -> OffboardingJob:
    """Starts offboarding: validates RSA >= 3072 PEM, queues `tenant.freeze`, and creates the job."""
    if viewer.account_ids is not None and body.account_id not in viewer.account_ids:
        raise ApiError(404, "not_found", "Account not found.")
    try:
        load_rsa_public_key(body.recipient_pem)
        pem_sha = pem_fingerprint(body.recipient_pem)
    except ValueError as exc:
        raise ApiError(400, "invalid_request", str(exc)) from None

    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    now, job_id = datetime.now(UTC).replace(microsecond=0), f"off-{secrets.token_hex(8)}"

    async with engine_of(request).begin() as conn:
        acc = (
            await conn.execute(
                select(accounts.c.id, accounts.c.delivery_model, accounts.c.region, accounts.c.tenant_ids).where(
                    accounts.c.id == body.account_id
                )
            )
        ).first()
        if acc is None:
            raise ApiError(404, "not_found", "Account not found.")
        if body.tenant_id not in list(acc.tenant_ids):
            raise ApiError(404, "not_found", "Tenant does not belong to this account.")
        dep_id = await _resolve_cell(conn, str(acc.id), str(acc.delivery_model), str(acc.region))
        cmd_id = await enqueue_command(
            conn,
            vault,
            deployment_id=dep_id,
            tenant_id=body.tenant_id,
            kind="tenant.freeze",
            args={"tenantId": body.tenant_id},
            issued_by=viewer.staff_id,
            ttl=timedelta(hours=1),
            key_name=cfg.command_signing_key,
        )
        steps, status = _steps_with(None, freeze_writes="running")
        row = (
            (
                await conn.execute(
                    offboarding_jobs.insert()
                    .values(
                        id=job_id,
                        account_id=body.account_id,
                        tenant_id=body.tenant_id,
                        steps=steps,
                        status=status,
                        shred_certificate_id=None,
                        requested_by_staff_id=viewer.staff_id,
                        created_at=now,
                        deployment_id=dep_id,
                        command_id=cmd_id,
                        recipient_pem=body.recipient_pem,
                        recipient_pem_sha256=pem_sha,
                    )
                    .returning(offboarding_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info(
        "offboarding job=%s step=freeze_writes staff=%s command=%s outcome=queued", job_id, viewer.staff_id, cmd_id
    )
    return _parse_job(row)


@router.post("/offboarding-jobs/{job_id}/confirm-download", response_model=OffboardingJob, response_model_by_alias=True)
async def confirm_download(job_id: str, request: Request, viewer: ProvisionManager) -> OffboardingJob:
    """Marks `export_downloaded` done after staff confirms the institution received the encrypted export."""
    async with engine_of(request).begin() as conn:
        row = await _lock_job(conn, job_id, viewer)
        st = {str(s["name"]): str(s["status"]) for s in list(row["steps"])}
        if row["status"] == "failed" or st["export_ready"] != "done" or st["export_downloaded"] != "pending":
            raise ApiError(409, "conflict", "Export must be ready before download can be confirmed.")
        steps, status = _steps_with(list(row["steps"]), export_downloaded="done")
        updated = (
            (
                await conn.execute(
                    update(offboarding_jobs)
                    .where(offboarding_jobs.c.id == job_id)
                    .values(steps=steps, status=status)
                    .returning(offboarding_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("offboarding job=%s step=export_downloaded staff=%s outcome=done", job_id, viewer.staff_id)
    return _parse_job(updated)


@router.post("/offboarding-jobs/{job_id}/approve-destroy", response_model=OffboardingJob, response_model_by_alias=True)
async def approve_destroy(job_id: str, request: Request, viewer: ProvisionManager) -> OffboardingJob:
    """Four-eyes key destruction: first call records approver 1; a second distinct staff member queues destroy."""
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    async with engine_of(request).begin() as conn:
        row = await _lock_job(conn, job_id, viewer)
        st = {str(s["name"]): str(s["status"]) for s in list(row["steps"])}
        if row["status"] == "failed" or st["export_downloaded"] != "done" or st["keys_destroyed"] != "pending":
            raise ApiError(409, "conflict", "Export download must be confirmed before key destruction can be approved.")
        if row["approver_1_staff_id"] is None:
            upd = (
                (
                    await conn.execute(
                        update(offboarding_jobs)
                        .where(offboarding_jobs.c.id == job_id)
                        .values(approver_1_staff_id=viewer.staff_id)
                        .returning(offboarding_jobs)
                    )
                )
                .mappings()
                .one()
            )
            log.info("offboarding job=%s step=keys_destroyed staff=%s outcome=approver_1", job_id, viewer.staff_id)
            return _parse_job(upd)
        if row["approver_2_staff_id"] is not None:
            raise ApiError(409, "conflict", "Key destruction has already been approved.")
        if row["approver_1_staff_id"] == viewer.staff_id:
            raise ApiError(409, "conflict", "A second, different staff member must approve key destruction.")
        dep_id, pem_sha = row["deployment_id"], row["recipient_pem_sha256"]
        if not dep_id or not pem_sha:
            raise ApiError(409, "conflict", "Offboarding job is missing deployment or export fingerprint.")
        approvers = [str(row["approver_1_staff_id"]), viewer.staff_id]
        cmd_id = await enqueue_command(
            conn,
            vault,
            deployment_id=str(dep_id),
            tenant_id=str(row["tenant_id"]),
            kind="tenant.destroy_keys",
            args={"tenantId": str(row["tenant_id"]), "exportPemSha256": str(pem_sha), "approvedBy": approvers},
            issued_by=viewer.staff_id,
            ttl=timedelta(hours=1),
            key_name=cfg.command_signing_key,
        )
        steps, status = _steps_with(list(row["steps"]), keys_destroyed="running")
        updated = (
            (
                await conn.execute(
                    update(offboarding_jobs)
                    .where(offboarding_jobs.c.id == job_id)
                    .values(approver_2_staff_id=viewer.staff_id, command_id=cmd_id, steps=steps, status=status)
                    .returning(offboarding_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("offboarding job=%s step=keys_destroyed staff=%s,%s command=%s outcome=queued", job_id, *approvers, cmd_id)
    return _parse_job(updated)


async def apply_offboarding_result(
    conn: Any, vault: Vault, cfg: ControlSettings, command_id: str, kind: str, cmd_status: str, result: dict[str, Any]
) -> None:
    """Advances an offboarding job when its cell reports `tenant.freeze`, `tenant.export`, or `tenant.destroy_keys`."""
    row = (
        (
            await conn.execute(
                select(offboarding_jobs).where(offboarding_jobs.c.command_id == command_id).with_for_update()
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    job_id, tenant_id, cur_steps = str(row["id"]), str(row["tenant_id"]), list(row["steps"])
    if kind == "tenant.freeze":
        if cmd_status != "done":
            steps, status = _steps_with(cur_steps, freeze_writes="failed")
            await conn.execute(
                update(offboarding_jobs).where(offboarding_jobs.c.id == job_id).values(steps=steps, status=status)
            )
            log.info("offboarding job=%s step=freeze_writes outcome=failed", job_id)
            return
        steps, status = _steps_with(cur_steps, freeze_writes="done", export_ready="running")
        exp_cmd = await enqueue_command(
            conn,
            vault,
            deployment_id=str(row["deployment_id"]),
            tenant_id=tenant_id,
            kind="tenant.export",
            args={"tenantId": tenant_id, "recipientPem": str(row["recipient_pem"])},
            issued_by=str(row["requested_by_staff_id"]),
            ttl=timedelta(hours=1),
            key_name=cfg.command_signing_key,
        )
        await conn.execute(
            update(offboarding_jobs)
            .where(offboarding_jobs.c.id == job_id)
            .values(steps=steps, status=status, command_id=exp_cmd, recipient_pem=None)
        )
        log.info("offboarding job=%s step=freeze_writes outcome=done next_command=%s", job_id, exp_cmd)
    elif kind == "tenant.export":
        ok = cmd_status == "done" and result.get("pemSha256") == row["recipient_pem_sha256"]
        steps, status = _steps_with(cur_steps, export_ready="done" if ok else "failed")
        await conn.execute(
            update(offboarding_jobs)
            .where(offboarding_jobs.c.id == job_id)
            .values(steps=steps, status=status, export_result=result if ok else None)
        )
        log.info("offboarding job=%s step=export_ready outcome=%s", job_id, "done" if ok else "failed")
    elif kind == "tenant.destroy_keys":
        key_ids = [str(k) for k in (result.get("keyIds") or []) if isinstance(k, str) and k]
        raw_destroyed = result.get("destroyedAt")
        if cmd_status != "done" or not key_ids or not isinstance(raw_destroyed, str):
            steps, status = _steps_with(cur_steps, keys_destroyed="failed")
            await conn.execute(
                update(offboarding_jobs).where(offboarding_jobs.c.id == job_id).values(steps=steps, status=status)
            )
            log.info("offboarding job=%s step=keys_destroyed outcome=failed", job_id)
            return
        destroyed_dt = (
            datetime.fromisoformat(raw_destroyed.replace("Z", "+00:00")).astimezone(UTC).replace(microsecond=0)
        )
        cert_id = f"shr-{secrets.token_hex(8)}"
        signing_key_id, signature = await sign_shred_certificate(
            vault,
            cfg.shred_signing_key,
            cert_id=cert_id,
            tenant_id=tenant_id,
            key_ids=key_ids,
            destroyed_at=utc_text(destroyed_dt),
        )
        await conn.execute(
            shred_certificates.insert().values(
                id=cert_id,
                tenant_id=tenant_id,
                key_ids=key_ids,
                destroyed_at=destroyed_dt,
                signing_key_id=signing_key_id,
                signature=signature,
            )
        )
        steps, status = _steps_with(cur_steps, keys_destroyed="done", certificate_issued="done")
        await conn.execute(
            update(offboarding_jobs)
            .where(offboarding_jobs.c.id == job_id)
            .values(steps=steps, status=status, shred_certificate_id=cert_id)
        )
        from nexus.control.moves import on_offboarding_certificate_issued

        await on_offboarding_certificate_issued(conn, job_id)
        log.info("offboarding job=%s step=certificate_issued cert=%s outcome=done", job_id, cert_id)
