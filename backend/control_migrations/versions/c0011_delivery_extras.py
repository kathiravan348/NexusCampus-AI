"""P08 extensions, P15 implementation projects, and P17 sandboxes (NEX-123).

`control_app`: SELECT only on all four tables (D23).

Revision ID: c0011_delivery_extras
Revises: c0010_support
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0011_delivery_extras"
down_revision: str | None = "c0010_support"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
_CODE_RE = r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$"
_SEMVER_RE = r"^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"
_LIVE_TASKS_DONE = (
    "status <> 'live' OR (go_live_date IS NOT NULL "
    "AND NOT jsonb_path_exists(tasks, '$[*] ? (@.done != true || !exists(@.done))'))"
)


def upgrade() -> None:
    op.create_table(
        "extensions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("code", sa.String(128), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("signed", sa.Boolean(), nullable=False),
        sa.Column("built_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"code ~ '{_CODE_RE}'", name="extensions_code_format"),
        sa.CheckConstraint("length(btrim(name)) >= 1", name="extensions_name_non_empty"),
        sa.CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="extensions_version_semver"),
    )
    op.create_table(
        "extension_compatibility",
        sa.Column("extension_id", sa.String(ID), sa.ForeignKey("extensions.id"), primary_key=True, index=True),
        sa.Column("release_version", sa.String(64), primary_key=True),
        sa.Column("result", sa.String(16), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=False),
        sa.Column("ai_drafted", sa.Boolean(), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"release_version ~ '{_SEMVER_RE}'", name="ext_compat_release_semver"),
        sa.CheckConstraint("result IN ('compatible', 'warning', 'incompatible')", name="ext_compat_result_known"),
        sa.CheckConstraint("result = 'compatible' OR length(btrim(notes)) > 0", name="ext_compat_notes_required"),
    )
    op.create_table(
        "implementation_projects",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("lead_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("go_live_date", sa.Date(), nullable=True),
        sa.Column("tasks", JSONB, nullable=False),
        sa.Column("plan_ai_drafted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('onboarding', 'migration', 'self_hosted_install', 'training')", name="projects_kind_known"
        ),
        sa.CheckConstraint("status IN ('planned', 'in_progress', 'live', 'on_hold')", name="projects_status_known"),
        sa.CheckConstraint(
            "jsonb_typeof(tasks) = 'array' AND jsonb_array_length(tasks) >= 1", name="projects_tasks_non_empty"
        ),
        sa.CheckConstraint(_LIVE_TASKS_DONE, name="projects_live_requires_go_live_and_all_done"),
    )
    op.create_table(
        "sandboxes",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=True, index=True),
        sa.Column("institution_type", sa.String(8), nullable=False),
        sa.Column("region", sa.String(8), nullable=False),
        sa.Column("data_kind", sa.String(16), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('sales_demo', 'staging_clone')", name="sandboxes_kind_known"),
        sa.CheckConstraint(
            "institution_type IN ('ey', 'k12', 'he', 'voc', 'tp', 'sk', 'onl', 'grp')",
            name="sandboxes_institution_type_known",
        ),
        sa.CheckConstraint("region IN ('in', 'eu', 'us', 'me', 'apac')", name="sandboxes_region_known"),
        sa.CheckConstraint("data_kind IN ('synthetic', 'masked')", name="sandboxes_data_kind_known"),
        sa.CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="sandboxes_version_semver"),
        sa.CheckConstraint("status IN ('creating', 'ready', 'expired', 'deleted')", name="sandboxes_status_known"),
        sa.CheckConstraint("kind <> 'sales_demo' OR data_kind = 'synthetic'", name="sandboxes_sales_demo_synthetic"),
        sa.CheckConstraint("kind <> 'staging_clone' OR account_id IS NOT NULL", name="sandboxes_staging_has_account"),
        sa.CheckConstraint("expires_at > created_at", name="sandboxes_expires_after_created"),
    )

    op.execute(
        f"GRANT SELECT ON extensions, extension_compatibility, implementation_projects, sandboxes TO {CONTROL_APP_ROLE}"
    )


def downgrade() -> None:
    op.drop_table("sandboxes")
    op.drop_table("implementation_projects")
    op.drop_table("extension_compatibility")
    op.drop_table("extensions")
