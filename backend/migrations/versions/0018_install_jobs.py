"""Backup jobs and diagnostic bundles of the install agent (M84, NEX-112). Install-wide; no tenant data.

Revision ID: 0018_install_jobs
Revises: 0017_install_status
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_install_jobs"
down_revision: str | None = "0017_install_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "install_backups",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("encrypted", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("file_name", sa.String(200), nullable=True),
        sa.CheckConstraint("kind IN ('backup', 'tenant_export')", name="install_backups_kind"),
        sa.CheckConstraint("status IN ('running', 'done', 'failed')", name="install_backups_status"),
        sa.CheckConstraint("encrypted", name="install_backups_always_encrypted"),
        sa.CheckConstraint("(status = 'running') = (finished_at IS NULL)", name="install_backups_finished"),
        sa.CheckConstraint("status <> 'done' OR size_bytes IS NOT NULL", name="install_backups_size_when_done"),
    )
    op.create_table(
        "install_diagnostics",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("scrubbed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("ticket_ref", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_by", sa.String(128), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("file_name", sa.String(200), nullable=True),
        sa.CheckConstraint(
            "status IN ('generating', 'ready_for_review', 'approved', 'sent', 'discarded')",
            name="install_diagnostics_status",
        ),
        sa.CheckConstraint("scrubbed", name="install_diagnostics_always_scrubbed"),
        sa.CheckConstraint(
            "(status IN ('approved', 'sent')) <= (reviewed_by IS NOT NULL)", name="install_diagnostics_reviewer"
        ),
        sa.CheckConstraint("(status = 'sent') = (sent_at IS NOT NULL)", name="install_diagnostics_sent_at"),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON install_backups, install_diagnostics TO nexus_app")


def downgrade() -> None:
    op.drop_table("install_diagnostics")
    op.drop_table("install_backups")
