"""P04 provisioning, offboarding & shred certificates, P18 portability moves on the control DB (NEX-121).

Read-only resources (`control_app` has SELECT only). `POST /provisioning-jobs` and `…/advance` are intentionally not
mounted yet so real mode never pretends a tenant was created before NEX-127. Partner scoping uses `Resource`:
offboarding and portability scope by `account_id`, while provisioning jobs (`request_account_id`) and shred
certificates have no `account_id` column and are hidden from partners (matching the mocks).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter
from pydantic import Field, StringConstraints
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, mount
from nexus.control.rows import from_db, to_db
from nexus.control.staff import (
    ControlCode,
    Id,
    InstitutionType,
    Region,
    UtcDateTime,
    metadata,
    staff_users,
)

ID = 64
_SIG_RE = r"^[A-Za-z0-9+/]{86}==$"
StepStatus = Literal["pending", "running", "done", "failed"]

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


class ProvisioningJob(CamelModel):
    id: Id
    request: ProvisioningRequest
    steps: list[ProvisioningStep]
    status: StepStatus
    tenant_id: Id | None
    requested_by_staff_id: Id
    created_at: UtcDateTime


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
                stmt.on_conflict_do_update(index_elements=["id"], set_={k: v for k, v in row.items() if k != "id"})
            )
            count += 1
    return count
