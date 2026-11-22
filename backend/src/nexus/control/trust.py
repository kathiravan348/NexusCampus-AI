"""P14 compliance & trust on the control database (NEX-126): sub-processors, certifications, incidents, DPAs.

Read-only resources (`control_app` has SELECT only). Partner scoping uses the shared `Resource` rule: `dpas` scopes
by `account_id`, while `sub-processors`, `certifications`, and `incidents` have no account column so partners see no
rows. Never log incident titles (V-6).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter
from pydantic import StringConstraints
from sqlalchemy import ARRAY, Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, String, Table, Text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, mount
from nexus.control.rows import to_db
from nexus.control.staff import CountryCode, Id, IsoDate, Name, UtcDateTime, metadata

ID = 64
_DPA_VER_RE = r"^\d+\.\d+$"

sub_processors = Table(
    "sub_processors",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("purpose", String(300), nullable=False),
    Column("country", String(2), nullable=False),
    Column("dpa_signed", Boolean, nullable=False),
    Column("touches_institution_data", Boolean, nullable=False),
    CheckConstraint("length(btrim(name)) >= 1", name="sub_processors_name_non_empty"),
    CheckConstraint("length(btrim(purpose)) >= 1", name="sub_processors_purpose_non_empty"),
    CheckConstraint("country ~ '^[A-Z]{2}$'", name="sub_processors_country_iso"),
)

certifications = Table(
    "certifications",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("code", String(16), nullable=False),
    Column("status", String(16), nullable=False),
    Column("valid_until", Date, nullable=True),
    CheckConstraint("code IN ('iso27001', 'iso27701', 'soc2', 'cert_in')", name="certifications_code_known"),
    CheckConstraint("status IN ('planned', 'in_audit', 'certified', 'lapsed')", name="certifications_status_known"),
    CheckConstraint(
        "(status = 'certified') = (valid_until IS NOT NULL)", name="certifications_valid_until_matches_status"
    ),
)

security_incidents = Table(
    "security_incidents",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("title", String(200), nullable=False),
    Column("severity", String(8), nullable=False),
    Column("status", String(24), nullable=False),
    Column("affected_account_ids", ARRAY(Text), nullable=False),
    Column("personal_data_affected", Boolean, nullable=False),
    Column("detected_at", DateTime(timezone=True), nullable=False),
    Column("breach_notification_due_at", DateTime(timezone=True), nullable=True),
    Column("notified_at", DateTime(timezone=True), nullable=True),
    Column("report_ai_drafted", Boolean, nullable=False),
    CheckConstraint("length(btrim(title)) >= 1", name="incidents_title_non_empty"),
    CheckConstraint("severity IN ('sev1', 'sev2', 'sev3', 'sev4')", name="incidents_severity_known"),
    CheckConstraint(
        "status IN ('investigating', 'contained', 'resolved', 'post_mortem_done')", name="incidents_status_known"
    ),
    CheckConstraint("control_text_array_unique(affected_account_ids)", name="incidents_affected_unique"),
    CheckConstraint(
        "personal_data_affected = (breach_notification_due_at IS NOT NULL)",
        name="incidents_due_at_matches_personal_data",
    ),
    CheckConstraint(
        "breach_notification_due_at IS NULL OR breach_notification_due_at >= detected_at",
        name="incidents_due_at_not_before_detected",
    ),
    CheckConstraint("notified_at IS NULL OR personal_data_affected", name="incidents_notified_only_for_breach"),
)

dpa_records = Table(
    "dpa_records",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("version", String(32), nullable=False),
    Column("signed_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("version ~ '^[0-9]+\\.[0-9]+$'", name="dpa_records_version_format"),
)


class SubProcessor(CamelModel):
    id: Id
    name: Name
    purpose: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
    country: CountryCode
    dpa_signed: bool
    touches_institution_data: bool


class Certification(CamelModel):
    id: Id
    code: Literal["iso27001", "iso27701", "soc2", "cert_in"]
    status: Literal["planned", "in_audit", "certified", "lapsed"]
    valid_until: IsoDate | None


class SecurityIncident(CamelModel):
    id: Id
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    severity: Literal["sev1", "sev2", "sev3", "sev4"]
    status: Literal["investigating", "contained", "resolved", "post_mortem_done"]
    affected_account_ids: list[Id]
    personal_data_affected: bool
    detected_at: UtcDateTime
    breach_notification_due_at: UtcDateTime | None
    notified_at: UtcDateTime | None
    report_ai_drafted: bool


class DpaRecord(CamelModel):
    id: Id
    account_id: Id
    version: Annotated[str, StringConstraints(pattern=_DPA_VER_RE)]
    signed_at: UtcDateTime


SEED_TABLES: list[tuple[str, Table, type[CamelModel]]] = [
    ("sub_processors", sub_processors, SubProcessor),
    ("certifications", certifications, Certification),
    ("incidents", security_incidents, SecurityIncident),
    ("dpas", dpa_records, DpaRecord),
]

router = APIRouter(prefix="/control/api/v1", tags=["P14 trust"])

SUB_PROCESSORS = Resource("sub-processors", sub_processors, SubProcessor, "ctl.trust.read", {}, key=None)
CERTIFICATIONS = Resource("certifications", certifications, Certification, "ctl.trust.read", {}, key=None)
INCIDENTS = Resource(
    "incidents",
    security_incidents,
    SecurityIncident,
    "ctl.trust.read",
    {"status": "status", "severity": "severity"},
    order=security_incidents.c.detected_at.desc(),
)
DPAS = Resource("dpas", dpa_records, DpaRecord, "ctl.trust.read", {"accountId": "account_id"}, key=None)

for resource in (SUB_PROCESSORS, CERTIFICATIONS, INCIDENTS, DPAS):
    mount(router, resource)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo sub-processors, certifications, security incidents and DPA records, after accounts."""
    count = 0
    for key, table, model in SEED_TABLES:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=["id"], set_={k: v for k, v in row.items() if k != "id"})
            )
            count += 1
    return count
