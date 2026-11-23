"""P04 provisioning, offboarding & shred certificates, P18 portability moves on the control DB (NEX-121, NEX-132)."""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal, Self

from fastapi import APIRouter, Depends, Request
from pydantic import Field, StringConstraints, model_validator
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import account_contacts, accounts
from nexus.control.commands import deployment_commands, enqueue_command
from nexus.control.fleet import deployments
from nexus.control.resources import CamelModel, Resource, engine_of, mount
from nexus.control.rows import from_db, to_db
from nexus.control.settings import ControlSettings
from nexus.control.staff import (
    ControlCode,
    Id,
    InstitutionType,
    Region,
    UtcDateTime,
    metadata,
    staff_users,
)
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.vault import Vault

ID = 64
_SIG_RE = r"^[A-Za-z0-9+/]{86}==$"
StepStatus = Literal["pending", "running", "done", "failed"]
PROV_STEPS = ("create_tenant", "create_keys", "apply_profile", "seed", "invite_owner")
log = logging.getLogger("nexus.control.provisioning")

provisioning_jobs = Table(
    "provisioning_jobs",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("request_account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("request_region", String(8), nullable=False),
    Column("request_institution_type", String(8), nullable=False),
    Column("request_plan_code", String(128), nullable=False),
    Column("request_trial_days", SmallInteger, nullable=True),
    Column("request_delivery_model", String(16), nullable=False),
    Column("steps", JSONB, nullable=False),
    Column("status", String(16), nullable=False),
    Column("tenant_id", String(ID), nullable=True),
    Column("requested_by_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    # Internal command-tracking columns (NEX-132; never exposed in `ProvisioningJob` contract)
    Column("planned_tenant_id", String(ID), nullable=True),
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=True),
    Column("command_id", String(ID), ForeignKey(deployment_commands.c.id), nullable=True, index=True),
    CheckConstraint("status IN ('pending', 'running', 'done', 'failed')", name="prov_status_known"),
)

offboarding_jobs = Table(
    "offboarding_jobs",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=False),
    Column("steps", JSONB, nullable=False),
    Column("status", String(16), nullable=False),
    Column("shred_certificate_id", String(ID), nullable=True),
    Column("requested_by_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    # Internal offboarding orchestration columns (NEX-134; never exposed in `OffboardingJob` contract)
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=True),
    Column("command_id", String(ID), ForeignKey(deployment_commands.c.id), nullable=True, index=True),
    Column("recipient_pem", Text, nullable=True),
    Column("recipient_pem_sha256", String(64), nullable=True),
    Column("export_result", JSONB, nullable=True),
    Column("approver_1_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=True),
    Column("approver_2_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=True),
    CheckConstraint("status IN ('pending', 'running', 'done', 'failed')", name="offb_status_known"),
)

shred_certificates = Table(
    "shred_certificates",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("tenant_id", String(ID), nullable=False, index=True),
    Column("key_ids", ARRAY(Text), nullable=False),
    Column("destroyed_at", DateTime(timezone=True), nullable=False),
    Column("signing_key_id", String(64), nullable=False),
    Column("signature", String(88), nullable=False),
    CheckConstraint("cardinality(key_ids) >= 1", name="shred_cert_key_ids_non_empty"),
)

portability_jobs = Table(
    "portability_jobs",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=False),
    Column("direction", String(24), nullable=False),
    Column("from_region", String(8), nullable=False),
    Column("to_region", String(8), nullable=False),
    Column("steps", JSONB, nullable=False),
    Column("status", String(16), nullable=False),
    Column("encrypted", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    # Internal move orchestration columns (NEX-136; never exposed in `PortabilityJob` contract)
    Column("requested_by_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=True),
    Column("source_deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=True),
    Column("destination_deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=True),
    Column("command_id", String(ID), ForeignKey(deployment_commands.c.id), nullable=True, index=True),
    Column("recipient_pem", Text, nullable=True),
    Column("recipient_pem_sha256", String(64), nullable=True),
    Column("file_name", String(200), nullable=True),
    Column("expected_rows", Integer, nullable=True),
    Column("offboarding_job_id", String(ID), ForeignKey(offboarding_jobs.c.id), nullable=True, index=True),
    CheckConstraint("encrypted = true", name="port_encrypted_true"),
)


class ProvisioningRequest(CamelModel):
    account_id: Id
    region: Region
    institution_type: InstitutionType
    plan_code: ControlCode
    trial_days: Annotated[int, Field(ge=1, le=60)] | None
    delivery_model: Literal["saas_shared", "saas_dedicated"]


class ProvisioningStep(CamelModel):
    name: Literal["create_tenant", "create_keys", "apply_profile", "seed", "invite_owner"]
    status: StepStatus


def _check_job_steps(steps: list[Any], expected: tuple[str, ...], status: str) -> None:
    if [s.name for s in steps] != list(expected):
        raise ValueError("steps must list every step once in order")
    statuses = [s.status for s in steps]
    if status == "done" and any(s != "done" for s in statuses):
        raise ValueError("done job must have every step done")
    if status == "failed" and "failed" not in statuses:
        raise ValueError("failed job must have a failed step")
    if status in ("pending", "running") and ("failed" in statuses or all(s == "done" for s in statuses)):
        raise ValueError("pending/running status contradicts steps")


class ProvisioningJob(CamelModel):
    id: Id
    request: ProvisioningRequest
    steps: list[ProvisioningStep]
    status: StepStatus
    tenant_id: Id | None
    requested_by_staff_id: Id
    created_at: UtcDateTime

    @model_validator(mode="after")
    def _prov_rules(self) -> Self:
        _check_job_steps(self.steps, PROV_STEPS, self.status)
        if (self.steps[0].status == "done") != (self.tenant_id is not None):
            raise ValueError("tenantId must be set iff create_tenant is done")
        return self


class OffboardingStep(CamelModel):
    name: Literal["freeze_writes", "export_ready", "export_downloaded", "keys_destroyed", "certificate_issued"]
    status: StepStatus


class OffboardingJob(CamelModel):
    id: Id
    account_id: Id
    tenant_id: Id
    steps: list[OffboardingStep]
    status: StepStatus
    shred_certificate_id: Id | None
    requested_by_staff_id: Id
    created_at: UtcDateTime

    @model_validator(mode="after")
    def _offb_rules(self) -> Self:
        expected = ("freeze_writes", "export_ready", "export_downloaded", "keys_destroyed", "certificate_issued")
        _check_job_steps(self.steps, expected, self.status)
        if (self.steps[-1].status == "done") != (self.shred_certificate_id is not None):
            raise ValueError("shredCertificateId must be set iff certificate_issued is done")
        return self


class ShredCertificate(CamelModel):
    id: Id
    tenant_id: Id
    key_ids: Annotated[list[Id], Field(min_length=1)]
    destroyed_at: UtcDateTime
    signing_key_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    signature: Annotated[str, StringConstraints(pattern=_SIG_RE)]


class PortabilityStep(CamelModel):
    name: Literal["preflight", "export_encrypted", "transfer", "import", "verify", "cutover", "shred_source"]
    status: StepStatus


class PortabilityJob(CamelModel):
    id: Id
    account_id: Id
    tenant_id: Id
    direction: Literal["saas_to_self_hosted", "self_hosted_to_saas", "region_move"]
    from_region: Region
    to_region: Region
    steps: list[PortabilityStep]
    status: StepStatus
    encrypted: Literal[True]
    created_at: UtcDateTime

    @model_validator(mode="after")
    def _port_rules(self) -> Self:
        expected = ("preflight", "export_encrypted", "transfer", "import", "verify", "cutover", "shred_source")
        _check_job_steps(self.steps, expected, self.status)
        if self.direction == "region_move" and self.from_region == self.to_region:
            raise ValueError("region_move requires two different regions")
        return self


class _ProvisioningResource(Resource):
    def parse(self, row: Any) -> CamelModel:
        flat = from_db(self.table, row)
        payload = {
            "id": flat["id"],
            "request": {
                "account_id": flat["request_account_id"],
                "region": flat["request_region"],
                "institution_type": flat["request_institution_type"],
                "plan_code": flat["request_plan_code"],
                "trial_days": flat["request_trial_days"],
                "delivery_model": flat["request_delivery_model"],
            },
            "steps": flat["steps"],
            "status": flat["status"],
            "tenant_id": flat["tenant_id"],
            "requested_by_staff_id": flat["requested_by_staff_id"],
            "created_at": flat["created_at"],
        }
        return ProvisioningJob.model_validate(payload)


def _provisioning_to_db(raw: dict[str, Any]) -> dict[str, Any]:
    job = ProvisioningJob.model_validate(raw).model_dump()
    req = job.pop("request")
    flat = {**job, **{f"request_{k}": v for k, v in req.items()}}
    return to_db(provisioning_jobs, flat)


router = APIRouter(prefix="/control/api/v1", tags=["P04/P18 provisioning & moves"])
PROVISIONING_JOBS = _ProvisioningResource(
    "provisioning-jobs",
    provisioning_jobs,
    ProvisioningJob,
    "ctl.provisioning.read",
    {"status": "status"},
    order=provisioning_jobs.c.created_at.desc(),
)
OFFBOARDING_JOBS = Resource(
    "offboarding-jobs",
    offboarding_jobs,
    OffboardingJob,
    "ctl.provisioning.read",
    {"accountId": "account_id", "status": "status"},
    order=offboarding_jobs.c.created_at.desc(),
)
SHRED_CERTIFICATES = Resource(
    "shred-certificates", shred_certificates, ShredCertificate, "ctl.provisioning.read", {"tenantId": "tenant_id"}
)
PORTABILITY_JOBS = Resource(
    "portability-jobs",
    portability_jobs,
    PortabilityJob,
    "ctl.portability.read",
    {"accountId": "account_id", "status": "status", "direction": "direction"},
    order=portability_jobs.c.created_at.desc(),
)
for resource in (PROVISIONING_JOBS, OFFBOARDING_JOBS, SHRED_CERTIFICATES, PORTABILITY_JOBS):
    mount(router, resource)

ProvisionManager = Annotated[Viewer, Depends(require("ctl.provisioning.manage"))]


async def _resolve_cell_and_owner(conn: Any, account_id: str, delivery_model: str, region: str) -> tuple[Any, Any]:
    if delivery_model == "saas_dedicated":
        dep = (
            await conn.execute(
                select(deployments.c.id, deployments.c.air_gapped).where(
                    deployments.c.account_id == account_id, deployments.c.kind == "saas_dedicated_cell"
                )
            )
        ).first()
    else:
        dep = (
            await conn.execute(
                select(deployments.c.id, deployments.c.air_gapped).where(
                    deployments.c.kind == "saas_shared_cell", deployments.c.region == region
                )
            )
        ).first()
    if dep is None or dep.air_gapped:
        raise ApiError(409, "conflict", "No reachable region cell is available for provisioning.")
    contacts = (
        await conn.execute(
            select(account_contacts.c.kind, account_contacts.c.name, account_contacts.c.work_email).where(
                account_contacts.c.account_id == account_id, account_contacts.c.kind.in_(("executive", "technical"))
            )
        )
    ).all()
    owner = next((c for c in contacts if c.kind == "executive"), None) or next(
        (c for c in contacts if c.kind == "technical"), None
    )
    if owner is None:
        raise ApiError(409, "conflict", "Account needs an executive or technical contact before provisioning.")
    return dep, owner


@router.post("/provisioning-jobs", response_model=ProvisioningJob, response_model_by_alias=True, status_code=201)
async def create_provisioning_job(
    body: ProvisioningRequest, request: Request, viewer: ProvisionManager
) -> ProvisioningJob:
    """Queues a real `tenant.provision` command on the chosen cell and creates the pending job."""
    if viewer.account_ids is not None and body.account_id not in viewer.account_ids:
        raise ApiError(404, "not_found", "Account not found.")
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    now = datetime.now(UTC).replace(microsecond=0)
    job_id = f"prv-{secrets.token_hex(8)}"
    planned_tid = f"ten-{secrets.token_hex(6)}"

    async with engine_of(request).begin() as conn:
        acc = (
            await conn.execute(
                select(accounts.c.id, accounts.c.name, accounts.c.delivery_model).where(
                    accounts.c.id == body.account_id
                )
            )
        ).first()
        if acc is None:
            raise ApiError(404, "not_found", "Account not found.")
        if acc.delivery_model == "self_hosted" or acc.delivery_model != body.delivery_model:
            raise ApiError(409, "conflict", "Account delivery model does not match this provisioning request.")
        dep, owner = await _resolve_cell_and_owner(conn, str(acc.id), body.delivery_model, body.region)

        cmd_id = await enqueue_command(
            conn,
            vault,
            deployment_id=str(dep.id),
            tenant_id=planned_tid,
            kind="tenant.provision",
            args={
                "tenantId": planned_tid,
                "name": str(acc.name),
                "institutionType": body.institution_type,
                "region": body.region,
                "planCode": body.plan_code,
                "trialDays": body.trial_days,
                "owner": {"legalName": str(owner.name), "workEmail": str(owner.work_email)},
            },
            issued_by=viewer.staff_id,
            ttl=timedelta(hours=1),
            key_name=cfg.command_signing_key,
        )
        steps = [{"name": n, "status": "pending"} for n in PROV_STEPS]
        row = (
            (
                await conn.execute(
                    provisioning_jobs.insert()
                    .values(
                        id=job_id,
                        request_account_id=body.account_id,
                        request_region=body.region,
                        request_institution_type=body.institution_type,
                        request_plan_code=body.plan_code,
                        request_trial_days=body.trial_days,
                        request_delivery_model=body.delivery_model,
                        steps=steps,
                        status="pending",
                        tenant_id=None,
                        requested_by_staff_id=viewer.staff_id,
                        created_at=now,
                        planned_tenant_id=planned_tid,
                        deployment_id=str(dep.id),
                        command_id=cmd_id,
                    )
                    .returning(provisioning_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("provisioning job=%s command=%s deployment=%s outcome=queued", job_id, cmd_id, dep.id)
    return ProvisioningJob.model_validate(PROVISIONING_JOBS.parse(row).model_dump())


@router.post("/provisioning-jobs/{job_id}/retry", response_model=ProvisioningJob, response_model_by_alias=True)
async def retry_provisioning_job(job_id: str, request: Request, viewer: ProvisionManager) -> ProvisioningJob:
    """Retries a failed provisioning job by queuing a fresh signed command with the same tenant id."""
    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    async with engine_of(request).begin() as conn:
        row = (
            (await conn.execute(select(provisioning_jobs).where(provisioning_jobs.c.id == job_id).with_for_update()))
            .mappings()
            .first()
        )
        if row is None or (viewer.account_ids is not None and row["request_account_id"] not in viewer.account_ids):
            raise ApiError(404, "not_found", "Provisioning job not found.")
        if row["status"] != "failed":
            raise ApiError(409, "conflict", "Only failed provisioning jobs can be retried.")
        acc = (
            await conn.execute(select(accounts.c.id, accounts.c.name).where(accounts.c.id == row["request_account_id"]))
        ).first()
        if acc is None:
            raise ApiError(409, "conflict", "Account not found.")
        dep, owner = await _resolve_cell_and_owner(
            conn, str(acc.id), str(row["request_delivery_model"]), str(row["request_region"])
        )
        planned_tid = str(row["planned_tenant_id"] or row["tenant_id"] or f"ten-{secrets.token_hex(6)}")
        cmd_id = await enqueue_command(
            conn,
            vault,
            deployment_id=str(dep.id),
            tenant_id=planned_tid,
            kind="tenant.provision",
            args={
                "tenantId": planned_tid,
                "name": str(acc.name),
                "institutionType": str(row["request_institution_type"]),
                "region": str(row["request_region"]),
                "planCode": str(row["request_plan_code"]),
                "trialDays": row["request_trial_days"],
                "owner": {"legalName": str(owner.name), "workEmail": str(owner.work_email)},
            },
            issued_by=viewer.staff_id,
            ttl=timedelta(hours=1),
            key_name=cfg.command_signing_key,
        )
        new_steps = [
            {"name": s["name"], "status": "done" if s["status"] == "done" else "pending"} for s in list(row["steps"])
        ]
        new_status = "running" if any(s["status"] == "done" for s in new_steps) else "pending"
        updated = (
            (
                await conn.execute(
                    update(provisioning_jobs)
                    .where(provisioning_jobs.c.id == job_id)
                    .values(steps=new_steps, status=new_status, command_id=cmd_id)
                    .returning(provisioning_jobs)
                )
            )
            .mappings()
            .one()
        )
    log.info("provisioning job=%s command=%s outcome=retried", job_id, cmd_id)
    return ProvisioningJob.model_validate(PROVISIONING_JOBS.parse(updated).model_dump())


async def apply_provisioning_result(conn: Any, command_id: str, cmd_status: str, result: dict[str, Any]) -> None:
    """Applies a cell agent's `tenant.provision` command result to the linked provisioning job + account."""
    row = (
        (
            await conn.execute(
                select(provisioning_jobs).where(provisioning_jobs.c.command_id == command_id).with_for_update()
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    steps_done = {str(x) for x in (result.get("stepsDone") or []) if isinstance(x, str)}
    failed_step = result.get("failedStep") if isinstance(result.get("failedStep"), str) else None
    existing = {str(s["name"]): str(s["status"]) for s in list(row["steps"])}

    updated_steps: list[dict[str, str]] = []
    for name in PROV_STEPS:
        if name in steps_done or existing.get(name) == "done":
            st = "done"
        elif name == failed_step:
            st = "failed"
        else:
            st = "pending"
        updated_steps.append({"name": name, "status": st})

    if cmd_status in ("failed", "rejected") and not any(s["status"] == "failed" for s in updated_steps):
        for step in updated_steps:
            if step["status"] != "done":
                step["status"] = "failed"
                break

    if all(s["status"] == "done" for s in updated_steps):
        job_status = "done"
    elif any(s["status"] == "failed" for s in updated_steps):
        job_status = "failed"
    elif any(s["status"] == "done" for s in updated_steps):
        job_status = "running"
    else:
        job_status = "pending"

    tenant_id = row["tenant_id"]
    if updated_steps[0]["status"] == "done" and tenant_id is None:
        tenant_id = row["planned_tenant_id"] or result.get("tenantId")
    if tenant_id is not None:
        acc_row = (
            await conn.execute(
                select(accounts.c.tenant_ids).where(accounts.c.id == row["request_account_id"]).with_for_update()
            )
        ).first()
        if acc_row is not None and tenant_id not in list(acc_row.tenant_ids):
            await conn.execute(
                update(accounts)
                .where(accounts.c.id == row["request_account_id"])
                .values(tenant_ids=[*list(acc_row.tenant_ids), str(tenant_id)])
            )

    await conn.execute(
        update(provisioning_jobs)
        .where(provisioning_jobs.c.id == row["id"])
        .values(steps=updated_steps, status=job_status, tenant_id=tenant_id)
    )
    done_names = [s["name"] for s in updated_steps if s["status"] == "done"]
    log.info(
        "provisioning job=%s command=%s status=%s steps_done=%s",
        row["id"],
        command_id,
        job_status,
        ",".join(done_names),
    )


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo provisioning jobs, offboarding jobs, shred certificates and portability jobs, after accounts."""
    count = 0
    for raw in data.get("provisioning_jobs", []):
        row = _provisioning_to_db(raw)
        stmt = pg_insert(provisioning_jobs).values(row)
        conn.execute(
            stmt.on_conflict_do_update(index_elements=["id"], set_={k: v for k, v in row.items() if k != "id"})
        )
        count += 1
    for key, table, model in (
        ("offboarding_jobs", offboarding_jobs, OffboardingJob),
        ("shred_certificates", shred_certificates, ShredCertificate),
        ("portability_jobs", portability_jobs, PortabilityJob),
    ):
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=[pk := "id"], set_={k: v for k, v in row.items() if k != pk})
            )
            count += 1
    return count
