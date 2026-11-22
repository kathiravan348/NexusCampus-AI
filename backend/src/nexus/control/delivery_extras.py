"""P08 extensions, P15 implementation projects, and P17 sandboxes on the control database (NEX-123).

Read-only resources (`control_app` has SELECT only). Partner scoping uses the shared `Resource` rule: `extensions`,
`projects` and `sandboxes` scope by `account_id` (sandboxes with `account_id IS NULL` are hidden from partners), and
`extension-compatibility` has no `account_id` or `id`, so partners see none.
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter
from pydantic import Field, StringConstraints
from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, mount
from nexus.control.rows import to_db
from nexus.control.staff import (
    ControlCode,
    Id,
    InstitutionType,
    IsoDate,
    Name,
    Region,
    Semver,
    UtcDateTime,
    metadata,
    staff_users,
)

ID = 64
_CODE_RE = r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$"
_SEMVER_RE = r"^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"
_LIVE_TASKS_DONE = (
    "status <> 'live' OR (go_live_date IS NOT NULL "
    "AND NOT jsonb_path_exists(tasks, '$[*] ? (@.done != true || !exists(@.done))'))"
)

extensions = Table(
    "extensions",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("code", String(128), nullable=False),
    Column("name", String(200), nullable=False),
    Column("version", String(64), nullable=False),
    Column("signed", Boolean, nullable=False),
    Column("built_at", DateTime(timezone=True), nullable=False),
    CheckConstraint(f"code ~ '{_CODE_RE}'", name="extensions_code_format"),
    CheckConstraint("length(btrim(name)) >= 1", name="extensions_name_non_empty"),
    CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="extensions_version_semver"),
)

extension_compatibility = Table(
    "extension_compatibility",
    metadata,
    Column("extension_id", String(ID), ForeignKey(extensions.c.id), primary_key=True, index=True),
    Column("release_version", String(64), primary_key=True),
    Column("result", String(16), nullable=False),
    Column("notes", String(2000), nullable=False),
    Column("ai_drafted", Boolean, nullable=False),
    Column("checked_at", DateTime(timezone=True), nullable=False),
    CheckConstraint(f"release_version ~ '{_SEMVER_RE}'", name="ext_compat_release_semver"),
    CheckConstraint("result IN ('compatible', 'warning', 'incompatible')", name="ext_compat_result_known"),
    CheckConstraint("result = 'compatible' OR length(btrim(notes)) > 0", name="ext_compat_notes_required"),
)

implementation_projects = Table(
    "implementation_projects",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("kind", String(24), nullable=False),
    Column("status", String(16), nullable=False),
    Column("lead_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("go_live_date", Date, nullable=True),
    Column("tasks", JSONB, nullable=False),
    Column("plan_ai_drafted", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint(
        "kind IN ('onboarding', 'migration', 'self_hosted_install', 'training')", name="projects_kind_known"
    ),
    CheckConstraint("status IN ('planned', 'in_progress', 'live', 'on_hold')", name="projects_status_known"),
    CheckConstraint(
        "jsonb_typeof(tasks) = 'array' AND jsonb_array_length(tasks) >= 1", name="projects_tasks_non_empty"
    ),
    CheckConstraint(_LIVE_TASKS_DONE, name="projects_live_requires_go_live_and_all_done"),
)

sandboxes = Table(
    "sandboxes",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("kind", String(24), nullable=False),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=True, index=True),
    Column("institution_type", String(8), nullable=False),
    Column("region", String(8), nullable=False),
    Column("data_kind", String(16), nullable=False),
    Column("version", String(64), nullable=False),
    Column("status", String(16), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("kind IN ('sales_demo', 'staging_clone')", name="sandboxes_kind_known"),
    CheckConstraint(
        "institution_type IN ('ey', 'k12', 'he', 'voc', 'tp', 'sk', 'onl', 'grp')",
        name="sandboxes_institution_type_known",
    ),
    CheckConstraint("region IN ('in', 'eu', 'us', 'me', 'apac')", name="sandboxes_region_known"),
    CheckConstraint("data_kind IN ('synthetic', 'masked')", name="sandboxes_data_kind_known"),
    CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="sandboxes_version_semver"),
    CheckConstraint("status IN ('creating', 'ready', 'expired', 'deleted')", name="sandboxes_status_known"),
    CheckConstraint("kind <> 'sales_demo' OR data_kind = 'synthetic'", name="sandboxes_sales_demo_synthetic"),
    CheckConstraint("kind <> 'staging_clone' OR account_id IS NOT NULL", name="sandboxes_staging_has_account"),
    CheckConstraint("expires_at > created_at", name="sandboxes_expires_after_created"),
)


class Extension(CamelModel):
    id: Id
    account_id: Id
    code: ControlCode
    name: Name
    version: Semver
    signed: bool
    built_at: UtcDateTime


class ExtensionCompatibility(CamelModel):
    extension_id: Id
    release_version: Semver
    result: Literal["compatible", "warning", "incompatible"]
    notes: Annotated[str, StringConstraints(max_length=2000)]
    ai_drafted: bool
    checked_at: UtcDateTime


class ProjectTask(CamelModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    done: bool
    due_date: IsoDate | None


class ImplementationProject(CamelModel):
    id: Id
    account_id: Id
    kind: Literal["onboarding", "migration", "self_hosted_install", "training"]
    status: Literal["planned", "in_progress", "live", "on_hold"]
    lead_staff_id: Id
    go_live_date: IsoDate | None
    tasks: Annotated[list[ProjectTask], Field(min_length=1)]
    plan_ai_drafted: bool
    created_at: UtcDateTime


class Sandbox(CamelModel):
    id: Id
    kind: Literal["sales_demo", "staging_clone"]
    account_id: Id | None
    institution_type: InstitutionType
    region: Region
    data_kind: Literal["synthetic", "masked"]
    version: Semver
    status: Literal["creating", "ready", "expired", "deleted"]
    created_at: UtcDateTime
    expires_at: UtcDateTime


SEED_TABLES: list[tuple[str, Table, type[CamelModel], list[str]]] = [
    ("extensions", extensions, Extension, ["id"]),
    ("compatibility", extension_compatibility, ExtensionCompatibility, ["extension_id", "release_version"]),
    ("projects", implementation_projects, ImplementationProject, ["id"]),
    ("sandboxes", sandboxes, Sandbox, ["id"]),
]

router = APIRouter(prefix="/control/api/v1", tags=["P08/P15/P17 delivery"])

EXTENSIONS = Resource("extensions", extensions, Extension, "ctl.extension.read", {"accountId": "account_id"})
EXTENSION_COMPATIBILITY = Resource(
    "extension-compatibility",
    extension_compatibility,
    ExtensionCompatibility,
    "ctl.extension.read",
    {"extensionId": "extension_id", "releaseVersion": "release_version", "result": "result"},
    key=None,
    order=extension_compatibility.c.extension_id,
)
PROJECTS = Resource(
    "projects",
    implementation_projects,
    ImplementationProject,
    "ctl.project.read",
    {"accountId": "account_id", "status": "status", "kind": "kind"},
)
SANDBOXES = Resource(
    "sandboxes",
    sandboxes,
    Sandbox,
    "ctl.sandbox.read",
    {"kind": "kind", "status": "status", "accountId": "account_id"},
)

for resource in (EXTENSIONS, EXTENSION_COMPATIBILITY, PROJECTS, SANDBOXES):
    mount(router, resource)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo extensions, compatibility checks, implementation projects and sandboxes, after accounts."""
    count = 0
    for key, table, model, pk in SEED_TABLES:
        pk_set = set(pk)
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=pk, set_={k: v for k, v in row.items() if k not in pk_set})
            )
            count += 1
    return count
