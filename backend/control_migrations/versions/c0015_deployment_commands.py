"""Control -> deployment signed commands table (D60, NEX-128).

Revision ID: c0015_deployment_commands
Revises: c0014_provisioning_moves
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0015_deployment_commands"
down_revision = "c0014_provisioning_moves"
branch_labels = None
depends_on = None

ID = 64
_CMD_ID_RE = r"^cmd-[0-9a-f]{16}$"
_SIG_RE = r"^[A-Za-z0-9+/]{86}==$"


def upgrade() -> None:
    op.create_table(
        "deployment_commands",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=False),
        sa.Column("tenant_id", sa.String(ID), nullable=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("signature", sa.String(88), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.CheckConstraint(f"id ~ '{_CMD_ID_RE}'", name="dep_cmd_id_format"),
        sa.CheckConstraint(f"signature ~ '{_SIG_RE}'", name="dep_cmd_signature_format"),
        sa.CheckConstraint(
            "status IN ('pending', 'delivered', 'done', 'failed', 'rejected', 'expired')",
            name="dep_cmd_status_known",
        ),
        sa.CheckConstraint(
            "expires_at > issued_at AND expires_at <= issued_at + interval '24 hours'",
            name="dep_cmd_ttl_range",
        ),
        sa.CheckConstraint(
            "status <> 'delivered' OR delivered_at IS NOT NULL",
            name="dep_cmd_delivered_has_time",
        ),
        sa.CheckConstraint(
            "(status IN ('done', 'failed', 'rejected')) = (finished_at IS NOT NULL)",
            name="dep_cmd_finished_iff_terminal",
        ),
        sa.CheckConstraint(
            "status IN ('done', 'failed', 'rejected') OR result IS NULL",
            name="dep_cmd_result_only_when_terminal",
        ),
        sa.CheckConstraint(
            "result IS NULL OR octet_length(result::text) <= 4096",
            name="dep_cmd_result_max_bytes",
        ),
    )
    op.create_index(
        "ix_deployment_commands_dep_status_issued",
        "deployment_commands",
        ["deployment_id", "status", "issued_at"],
    )
    op.create_index("ix_deployment_commands_tenant_id", "deployment_commands", ["tenant_id"])

    op.execute(f"GRANT SELECT ON deployment_commands TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status, delivered_at, finished_at, result) ON deployment_commands TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_index("ix_deployment_commands_tenant_id", table_name="deployment_commands")
    op.drop_index("ix_deployment_commands_dep_status_issued", table_name="deployment_commands")
    op.drop_table("deployment_commands")
