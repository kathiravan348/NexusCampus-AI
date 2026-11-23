"""P04 provisioning write grants and internal command tracking columns (NEX-132).

Revision ID: c0018_provisioning_writes
Revises: c0017_broker
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0018_provisioning_writes"
down_revision = "c0017_broker"
branch_labels = None
depends_on = None

ID = 64


def upgrade() -> None:
    op.add_column("provisioning_jobs", sa.Column("planned_tenant_id", sa.String(ID), nullable=True))
    op.add_column(
        "provisioning_jobs",
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=True),
    )
    op.add_column(
        "provisioning_jobs",
        sa.Column("command_id", sa.String(ID), sa.ForeignKey("deployment_commands.id"), nullable=True),
    )
    op.create_index("ix_provisioning_jobs_command_id", "provisioning_jobs", ["command_id"])

    op.execute(f"GRANT INSERT ON provisioning_jobs TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (steps, status, tenant_id, command_id) ON provisioning_jobs TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (tenant_ids) ON accounts TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE (tenant_ids) ON accounts FROM {CONTROL_APP_ROLE}")
    op.execute(f"REVOKE INSERT, UPDATE ON provisioning_jobs FROM {CONTROL_APP_ROLE}")
    op.drop_index("ix_provisioning_jobs_command_id", table_name="provisioning_jobs")
    op.drop_column("provisioning_jobs", "command_id")
    op.drop_column("provisioning_jobs", "deployment_id")
    op.drop_column("provisioning_jobs", "planned_tenant_id")
