"""P18 portability move orchestration (D61, NEX-136): seven-step moves across regions and delivery models."""

import logging
import secrets
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field, StringConstraints
from sqlalchemy import select, update

from nexus.agent.tenant_export import load_rsa_public_key, pem_fingerprint
from nexus.control.accounts import accounts
from nexus.control.commands import enqueue_command
from nexus.control.fleet import deployments
from nexus.control.offboarding import _steps_with as _offb_steps_with
from nexus.control.provisioning import PORTABILITY_JOBS, PortabilityJob, offboarding_jobs, portability_jobs
from nexus.control.resources import CamelModel, engine_of
from nexus.control.settings import ControlSettings
from nexus.control.staff import Id, Region
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.vault import Vault

log = logging.getLogger("nexus.control.moves")
MOVE_STEPS = ("preflight", "export_encrypted", "transfer", "import", "verify", "cutover", "shred_source")
MoveStep = Literal["preflight", "export_encrypted", "transfer", "import", "verify", "cutover", "shred_source"]
MoveDirection = Literal["saas_to_self_hosted", "self_hosted_to_saas", "region_move"]
router = APIRouter(prefix="/control/api/v1", tags=["P18 moves"])
MoveManager = Annotated[Viewer, Depends(require("ctl.portability.manage"))]


class PortabilityRequest(CamelModel):
    account_id: Id
    tenant_id: Id
    direction: MoveDirection
    to_region: Region


class ConfirmStepInput(CamelModel):
    step: MoveStep
    pem: Annotated[str, StringConstraints(strip_whitespace=True, min_length=64, max_length=1900)] | None = None
    file_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    rows: Annotated[int, Field(ge=1)] | None = None
    chain_ok: bool | None = None
    checkpoint_ok: bool | None = None


def _steps_with(existing: list[dict[str, Any]] | None, **updates: str) -> tuple[list[dict[str, str]], str]:
    st = {str(s["name"]): str(s["status"]) for s in existing} if existing else dict.fromkeys(MOVE_STEPS, "pending")
    st.update(updates)
    steps = [{"name": n, "status": st[n]} for n in MOVE_STEPS]
    if all(s["status"] == "done" for s in steps):
        status = "done"
    elif any(s["status"] == "failed" for s in steps):
        status = "failed"
    elif any(s["status"] in ("running", "done") for s in steps):
        status = "running"
    else:
        status = "pending"
    return steps, status


def _parse_job(row: Mapping[Any, Any]) -> PortabilityJob:
    return PortabilityJob.model_validate(PORTABILITY_JOBS.parse(row).model_dump())


def _current_step(steps: list[dict[str, Any]]) -> tuple[str, str] | None:
    for s in steps:
        if s["status"] != "done":
            return str(s["name"]), str(s["status"])
    return None


def _src_is_cell(direction: str) -> bool:
    return direction in ("region_move", "saas_to_self_hosted")


def _dst_is_cell(direction: str) -> bool:
    return direction in ("region_move", "self_hosted_to_saas")


def _is_plain_filename(name: str) -> bool:
    return bool(name) and "/" not in name and "\\" not in name and name not in (".", "..") and Path(name).name == name


async def _find_cell(conn: Any, account_id: str, delivery_model: str, region: str) -> str:
    cond = (
        (deployments.c.account_id == account_id, deployments.c.kind == "saas_dedicated_cell")
        if delivery_model == "saas_dedicated"
        else (deployments.c.kind == "saas_shared_cell", deployments.c.region == region)
    )
    dep = (await conn.execute(select(deployments.c.id, deployments.c.air_gapped).where(*cond))).first()
    if dep is None or dep.air_gapped:
        raise ApiError(409, "conflict", "No reachable cell deployment is available for this move.")
    return str(dep.id)


async def _find_self_hosted(conn: Any, account_id: str) -> str | None:
    dep = (
        await conn.execute(
            select(deployments.c.id).where(deployments.c.account_id == account_id, deployments.c.kind == "self_hosted")
        )
    ).first()
    return str(dep.id) if dep is not None else None


async def _lock_job(conn: Any, job_id: str, viewer: Viewer) -> dict[str, Any]:
    row = (
        (await conn.execute(select(portability_jobs).where(portability_jobs.c.id == job_id).with_for_update()))
        .mappings()
        .first()
    )
    if row is None or (viewer.account_ids is not None and row["account_id"] not in viewer.account_ids):
        raise ApiError(404, "not_found", "Portability job not found.")
    return dict(row)


@router.post("/portability-jobs", response_model=PortabilityJob, response_model_by_alias=True, status_code=201)
async def create_portability_job(body: PortabilityRequest, request: Request, viewer: MoveManager) -> PortabilityJob:
    """Starts a 7-step portability move; queues `tenant.import_key` immediately when the destination is a SaaS cell."""
    if viewer.account_ids is not None and body.account_id not in viewer.account_ids:
        raise ApiError(404, "not_found", "Account not found.")
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    now, job_id = datetime.now(UTC).replace(microsecond=0), f"mov-{secrets.token_hex(8)}"

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
        from_region, model, tids = str(acc.region), str(acc.delivery_model), list(acc.tenant_ids)
        if body.direction == "region_move" and from_region == body.to_region:
            raise ApiError(422, "invalid_request", "A region move requires two different regions.")
        src_dep: str | None
        if _src_is_cell(body.direction):
            if model == "self_hosted":
                raise ApiError(409, "conflict", "Source account must be a SaaS account for this move.")
            if body.tenant_id not in tids:
                raise ApiError(404, "not_found", "Tenant does not belong to this account.")
            src_dep = await _find_cell(conn, str(acc.id), model, from_region)
        else:
            if model != "self_hosted":
                raise ApiError(409, "conflict", "Source account must be self-hosted for this move.")
            src_dep = await _find_self_hosted(conn, str(acc.id))
        dst_dep = (
            await _find_cell(conn, str(acc.id), "saas_shared", body.to_region)
            if _dst_is_cell(body.direction)
            else await _find_self_hosted(conn, str(acc.id))
        )
        cmd_id = (
            await enqueue_command(
                conn,
                vault,
                deployment_id=str(dst_dep),
                tenant_id=None,
                kind="tenant.import_key",
                args={},
                issued_by=viewer.staff_id,
                ttl=timedelta(hours=1),
                key_name=cfg.command_signing_key,
            )
            if _dst_is_cell(body.direction)
            else None
        )
        steps, status = _steps_with(None)
        row = (
            (
                await conn.execute(
                    portability_jobs.insert()
                    .values(
                        id=job_id,
                        account_id=body.account_id,
                        tenant_id=body.tenant_id,
                        direction=body.direction,
                        from_region=from_region,
                        to_region=body.to_region,
                        steps=steps,
                        status=status,
                        encrypted=True,
                        created_at=now,
                        requested_by_staff_id=viewer.staff_id,
                        source_deployment_id=src_dep,
                        destination_deployment_id=dst_dep,
                        command_id=cmd_id,
                    )
                    .returning(portability_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("move job=%s step=created staff=%s direction=%s outcome=pending", job_id, viewer.staff_id, body.direction)
    return _parse_job(row)


async def _apply_cutover(conn: Any, row: dict[str, Any]) -> None:
    acc = (
        await conn.execute(
            select(accounts.c.region, accounts.c.delivery_model, accounts.c.tenant_ids)
            .where(accounts.c.id == row["account_id"])
            .with_for_update()
        )
    ).one()
    tids = list(acc.tenant_ids)
    tid, direction, to_region = str(row["tenant_id"]), str(row["direction"]), str(row["to_region"])
    if direction == "region_move":
        vals: dict[str, Any] = {"region": to_region}
    elif direction == "saas_to_self_hosted":
        vals = {"region": to_region, "delivery_model": "self_hosted", "tenant_ids": [t for t in tids if t != tid]}
    else:
        new_tids = tids if tid in tids else [*tids, tid]
        vals = {"region": to_region, "delivery_model": "saas_shared", "tenant_ids": new_tids}
    await conn.execute(update(accounts).where(accounts.c.id == row["account_id"]).values(**vals))


@router.post("/portability-jobs/{job_id}/confirm", response_model=PortabilityJob, response_model_by_alias=True)
async def confirm_step(job_id: str, body: ConfirmStepInput, request: Request, viewer: MoveManager) -> PortabilityJob:
    """Confirms the current pending staff step on a portability job."""
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    async with engine_of(request).begin() as conn:
        row = await _lock_job(conn, job_id, viewer)
        cur = _current_step(list(row["steps"]))
        if row["status"] == "failed" or cur is None or cur[0] != body.step or cur[1] != "pending":
            raise ApiError(409, "conflict", "This step is not the current pending step.")
        direction, tid = str(row["direction"]), str(row["tenant_id"])
        updates: dict[str, Any] = {}

        if body.step == "preflight":
            if _dst_is_cell(direction):
                raise ApiError(409, "conflict", "Preflight runs automatically on the destination cell.")
            if not body.pem:
                raise ApiError(400, "invalid_request", "Destination RSA public key PEM is required.")
            try:
                load_rsa_public_key(body.pem)
                sha = pem_fingerprint(body.pem)
            except ValueError as exc:
                raise ApiError(400, "invalid_request", str(exc)) from None
            cmd_id = await enqueue_command(
                conn,
                vault,
                deployment_id=str(row["source_deployment_id"]),
                tenant_id=tid,
                kind="tenant.freeze",
                args={"tenantId": tid},
                issued_by=viewer.staff_id,
                ttl=timedelta(hours=1),
                key_name=cfg.command_signing_key,
            )
            steps, status = _steps_with(list(row["steps"]), preflight="done", export_encrypted="running")
            updates = {"recipient_pem": body.pem, "recipient_pem_sha256": sha, "command_id": cmd_id}
        elif body.step == "export_encrypted":
            if _src_is_cell(direction):
                raise ApiError(409, "conflict", "Export runs automatically on the source cell.")
            if not body.file_name or not _is_plain_filename(body.file_name) or body.rows is None:
                raise ApiError(400, "invalid_request", "Valid fileName and rows are required.")
            steps, status = _steps_with(list(row["steps"]), export_encrypted="done")
            updates = {"file_name": body.file_name, "expected_rows": body.rows}
        elif body.step == "transfer":
            if _dst_is_cell(direction):
                cmd_id = await enqueue_command(
                    conn,
                    vault,
                    deployment_id=str(row["destination_deployment_id"]),
                    tenant_id=tid,
                    kind="tenant.import",
                    args={
                        "tenantId": tid,
                        "fileName": str(row["file_name"]),
                        "pemSha256": str(row["recipient_pem_sha256"]),
                        "expectedRows": int(row["expected_rows"]),
                    },
                    issued_by=viewer.staff_id,
                    ttl=timedelta(hours=1),
                    key_name=cfg.command_signing_key,
                )
                steps, status = _steps_with(list(row["steps"]), transfer="done", **{"import": "running"})
                updates = {"command_id": cmd_id}
            else:
                steps, status = _steps_with(list(row["steps"]), transfer="done")
        elif body.step == "import":
            if _dst_is_cell(direction):
                raise ApiError(409, "conflict", "Import runs automatically on the destination cell.")
            if body.rows is None:
                raise ApiError(400, "invalid_request", "Imported row count is required.")
            ok = body.chain_ok is not False and body.checkpoint_ok is not False
            steps, status = _steps_with(list(row["steps"]), **{"import": "done", "verify": "done" if ok else "failed"})
        elif body.step == "cutover":
            await _apply_cutover(conn, row)
            if _src_is_cell(direction):
                off_id = f"off-{secrets.token_hex(8)}"
                off_steps, off_status = _offb_steps_with(
                    None, freeze_writes="done", export_ready="done", export_downloaded="done"
                )
                await conn.execute(
                    offboarding_jobs.insert().values(
                        id=off_id,
                        account_id=row["account_id"],
                        tenant_id=tid,
                        steps=off_steps,
                        status=off_status,
                        shred_certificate_id=None,
                        requested_by_staff_id=viewer.staff_id,
                        created_at=datetime.now(UTC).replace(microsecond=0),
                        deployment_id=row["source_deployment_id"],
                        recipient_pem_sha256=row["recipient_pem_sha256"],
                    )
                )
                steps, status = _steps_with(list(row["steps"]), cutover="done", shred_source="running")
                updates = {"offboarding_job_id": off_id}
            else:
                steps, status = _steps_with(list(row["steps"]), cutover="done")
        elif body.step == "shred_source":
            if _src_is_cell(direction):
                raise ApiError(
                    409, "conflict", "Source cell key destruction completes via its offboarding certificate."
                )
            steps, status = _steps_with(list(row["steps"]), shred_source="done")
        else:
            raise ApiError(409, "conflict", "This step cannot be confirmed manually.")

        updated = (
            (
                await conn.execute(
                    update(portability_jobs)
                    .where(portability_jobs.c.id == job_id)
                    .values(steps=steps, status=status, **updates)
                    .returning(portability_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("move job=%s step=%s staff=%s outcome=%s", job_id, body.step, viewer.staff_id, status)
    return _parse_job(updated)


@router.post("/portability-jobs/{job_id}/retry", response_model=PortabilityJob, response_model_by_alias=True)
async def retry_portability_job(job_id: str, request: Request, viewer: MoveManager) -> PortabilityJob:
    """Retries a failed portability job from its failed step."""
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    async with engine_of(request).begin() as conn:
        row = await _lock_job(conn, job_id, viewer)
        if row["status"] != "failed":
            raise ApiError(409, "conflict", "Only failed portability jobs can be retried.")
        failed_step = next((str(s["name"]) for s in list(row["steps"]) if s["status"] == "failed"), None)
        if failed_step is None:
            raise ApiError(409, "conflict", "No failed step found.")
        direction, tid = str(row["direction"]), str(row["tenant_id"])
        updates: dict[str, Any] = {}
        if failed_step == "preflight" and _dst_is_cell(direction):
            cmd_id = await enqueue_command(
                conn, vault, deployment_id=str(row["destination_deployment_id"]), tenant_id=None,
                kind="tenant.import_key", args={}, issued_by=viewer.staff_id, ttl=timedelta(hours=1),
                key_name=cfg.command_signing_key,
            )  # fmt: skip
            steps, status = _steps_with(list(row["steps"]), preflight="running")
            updates = {"command_id": cmd_id}
        elif failed_step in ("import", "verify") and _dst_is_cell(direction):
            cmd_id = await enqueue_command(
                conn, vault, deployment_id=str(row["destination_deployment_id"]), tenant_id=tid,
                kind="tenant.import",
                args={
                    "tenantId": tid, "fileName": str(row["file_name"]),
                    "pemSha256": str(row["recipient_pem_sha256"]), "expectedRows": int(row["expected_rows"]),
                },
                issued_by=viewer.staff_id, ttl=timedelta(hours=1), key_name=cfg.command_signing_key,
            )  # fmt: skip
            steps, status = _steps_with(list(row["steps"]), **{"import": "running", "verify": "pending"})
            updates = {"command_id": cmd_id}
        elif failed_step == "export_encrypted" and _src_is_cell(direction) and row["recipient_pem"]:
            cmd_id = await enqueue_command(
                conn, vault, deployment_id=str(row["source_deployment_id"]), tenant_id=tid,
                kind="tenant.freeze", args={"tenantId": tid}, issued_by=viewer.staff_id,
                ttl=timedelta(hours=1), key_name=cfg.command_signing_key,
            )  # fmt: skip
            steps, status = _steps_with(list(row["steps"]), export_encrypted="running")
            updates = {"command_id": cmd_id}
        else:
            steps, status = _steps_with(list(row["steps"]), **{failed_step: "pending"})
        updated = (
            (
                await conn.execute(
                    update(portability_jobs)
                    .where(portability_jobs.c.id == job_id)
                    .values(steps=steps, status=status, **updates)
                    .returning(portability_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("move job=%s step=%s staff=%s outcome=retried", job_id, failed_step, viewer.staff_id)
    return _parse_job(updated)


async def apply_move_result(
    conn: Any, vault: Vault, cfg: ControlSettings, command_id: str, kind: str, cmd_status: str, result: dict[str, Any]
) -> None:
    """Advances a portability job from a cell's `tenant.import_key`/`freeze`/`export`/`import` command result."""
    row = (
        (
            await conn.execute(
                select(portability_jobs).where(portability_jobs.c.command_id == command_id).with_for_update()
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    job_id, tid, direction, cur = str(row["id"]), str(row["tenant_id"]), str(row["direction"]), list(row["steps"])
    issuer = str(row["requested_by_staff_id"] or "system")

    if kind == "tenant.import_key":
        pem, sha = result.get("pem"), result.get("pemSha256")
        if cmd_status != "done" or not isinstance(pem, str) or not isinstance(sha, str):
            steps, status = _steps_with(cur, preflight="failed")
            await conn.execute(
                update(portability_jobs).where(portability_jobs.c.id == job_id).values(steps=steps, status=status)
            )
            log.info("move job=%s step=preflight outcome=failed", job_id)
            return
        updates: dict[str, Any] = {"recipient_pem": pem, "recipient_pem_sha256": sha}
        if _src_is_cell(direction):
            cmd = await enqueue_command(
                conn, vault, deployment_id=str(row["source_deployment_id"]), tenant_id=tid,
                kind="tenant.freeze", args={"tenantId": tid}, issued_by=issuer, ttl=timedelta(hours=1),
                key_name=cfg.command_signing_key,
            )  # fmt: skip
            steps, status = _steps_with(cur, preflight="done", export_encrypted="running")
            updates["command_id"] = cmd
        else:
            steps, status = _steps_with(cur, preflight="done")
        await conn.execute(
            update(portability_jobs)
            .where(portability_jobs.c.id == job_id)
            .values(steps=steps, status=status, **updates)
        )
        log.info("move job=%s step=preflight outcome=done", job_id)
    elif kind == "tenant.freeze":
        if cmd_status != "done":
            steps, status = _steps_with(cur, export_encrypted="failed")
            await conn.execute(
                update(portability_jobs).where(portability_jobs.c.id == job_id).values(steps=steps, status=status)
            )
            log.info("move job=%s step=export_encrypted outcome=failed", job_id)
            return
        exp_cmd = await enqueue_command(
            conn, vault, deployment_id=str(row["source_deployment_id"]), tenant_id=tid,
            kind="tenant.export", args={"tenantId": tid, "recipientPem": str(row["recipient_pem"])},
            issued_by=issuer, ttl=timedelta(hours=1), key_name=cfg.command_signing_key,
        )  # fmt: skip
        await conn.execute(
            update(portability_jobs)
            .where(portability_jobs.c.id == job_id)
            .values(command_id=exp_cmd, recipient_pem=None)
        )
        log.info("move job=%s step=export_encrypted outcome=export_queued", job_id)
    elif kind == "tenant.export":
        fname, rows_n, sha = result.get("fileName"), result.get("rows"), result.get("pemSha256")
        ok = (
            cmd_status == "done"
            and sha == row["recipient_pem_sha256"]
            and isinstance(fname, str)
            and isinstance(rows_n, int)
            and rows_n >= 1
        )
        steps, status = _steps_with(cur, export_encrypted="done" if ok else "failed")
        vals: dict[str, Any] = {"steps": steps, "status": status}
        if ok:
            vals.update({"file_name": fname, "expected_rows": rows_n})
        await conn.execute(update(portability_jobs).where(portability_jobs.c.id == job_id).values(**vals))
        log.info("move job=%s step=export_encrypted outcome=%s", job_id, "done" if ok else "failed")
    elif kind == "tenant.import":
        if cmd_status != "done":
            steps, status = _steps_with(cur, **{"import": "failed"})
        elif result.get("chainOk") is not True or result.get("checkpointOk") is not True:
            steps, status = _steps_with(cur, **{"import": "done", "verify": "failed"})
        else:
            steps, status = _steps_with(cur, **{"import": "done", "verify": "done"})
        await conn.execute(
            update(portability_jobs).where(portability_jobs.c.id == job_id).values(steps=steps, status=status)
        )
        log.info("move job=%s step=verify outcome=%s", job_id, status)


async def on_offboarding_certificate_issued(conn: Any, offboarding_job_id: str) -> None:
    """Completes `shred_source` on any portability job waiting on `offboarding_job_id`'s shred certificate."""
    row = (
        (
            await conn.execute(
                select(portability_jobs)
                .where(portability_jobs.c.offboarding_job_id == offboarding_job_id)
                .with_for_update()
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    steps, status = _steps_with(list(row["steps"]), shred_source="done")
    await conn.execute(
        update(portability_jobs).where(portability_jobs.c.id == row["id"]).values(steps=steps, status=status)
    )
    log.info("move job=%s step=shred_source outcome=%s", row["id"], status)
