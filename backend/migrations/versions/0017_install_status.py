"""Install status for the install agent (M84, NEX-105): one install-wide row, versions and counts only (V-7).

`nexus_install_entitle()` (SECURITY DEFINER) can do exactly one thing: give the tenant in the current context the
core `M84` entitlement on a self-hosted install. The agent runs as `nexus_app`, inside each tenant's context.

Revision ID: 0017_install_status
Revises: 0016_audit_checkpoints
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0017_install_status"
down_revision: str | None = "0016_audit_checkpoints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "install_status",
        sa.Column("id", sa.SmallInteger(), primary_key=True, server_default="1"),
        sa.Column("install_id", sa.String(64), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("channel", sa.String(8), nullable=False),
        sa.Column("licence", JSONB(), nullable=False),
        sa.Column("licence_problem", sa.String(32), nullable=True),
        sa.Column("air_gapped", sa.Boolean(), nullable=False),
        sa.Column("telemetry_enabled", sa.Boolean(), nullable=False),
        sa.Column("last_update_check_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_backup_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("update_offer", JSONB(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="install_status_single_row"),
        sa.CheckConstraint(
            "NOT air_gapped OR (NOT telemetry_enabled AND last_update_check_at IS NULL)",
            name="install_status_air_gapped_is_offline",
        ),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON install_status TO nexus_app")
    op.execute(
        "CREATE FUNCTION nexus_install_entitle() RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER "
        "SET search_path = public AS $$ "
        "INSERT INTO entitlements (tenant_id, module_id, enabled, source, expires_at) "
        "SELECT current_setting('app.tenant_id', true), 'M84', true, 'core', NULL "
        "WHERE current_setting('app.tenant_id', true) IS NOT NULL "
        "ON CONFLICT (tenant_id, module_id) DO NOTHING $$"
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_install_entitle() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_install_entitle() TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS nexus_install_entitle()")
    op.drop_table("install_status")
