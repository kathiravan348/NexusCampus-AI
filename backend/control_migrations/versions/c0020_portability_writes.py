"""P18 portability move writes, internal command/offboarding tracking columns, and account cutover grants (NEX-136).

Revision ID: c0020_portability_writes
Revises: c0019_offboarding_writes
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0020_portability_writes"
down_revision = "c0019_offboarding_writes"
branch_labels = None
depends_on = None

ID = 64


def upgrade() -> None:
    op.add_column(
        "portability_jobs",
        sa.Column("requested_by_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=True),
    )
    op.add_column(
        "portability_jobs",
        sa.Column("source_deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=True),
    )
    op.add_column(
        "portability_jobs",
        sa.Column("destination_deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=True),
    )
    op.add_column(
        "portability_jobs",
        sa.Column("command_id", sa.String(ID), sa.ForeignKey("deployment_commands.id"), nullable=True),
    )
    op.add_column("portability_jobs", sa.Column("recipient_pem", sa.Text(), nullable=True))
    op.add_column("portability_jobs", sa.Column("recipient_pem_sha256", sa.String(64), nullable=True))
    op.add_column("portability_jobs", sa.Column("file_name", sa.String(200), nullable=True))
    op.add_column("portability_jobs", sa.Column("expected_rows", sa.Integer(), nullable=True))
    op.add_column(
        "portability_jobs",
        sa.Column("offboarding_job_id", sa.String(ID), sa.ForeignKey("offboarding_jobs.id"), nullable=True),
    )
    op.create_index("ix_portability_jobs_command_id", "portability_jobs", ["command_id"])
    op.create_index("ix_portability_jobs_offboarding_job_id", "portability_jobs", ["offboarding_job_id"])

    op.execute(f"GRANT INSERT ON portability_jobs TO {CONTROL_APP_ROLE}")
    op.execute(
        "GRANT UPDATE (steps, status, command_id, recipient_pem, recipient_pem_sha256, file_name, expected_rows, "
        f"offboarding_job_id) ON portability_jobs TO {CONTROL_APP_ROLE}"
    )
    op.execute(f"GRANT UPDATE (region, tenant_ids, delivery_model) ON accounts TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE (region, delivery_model) ON accounts FROM {CONTROL_APP_ROLE}")
    op.execute(f"REVOKE INSERT, UPDATE ON portability_jobs FROM {CONTROL_APP_ROLE}")
    op.drop_index("ix_portability_jobs_offboarding_job_id", table_name="portability_jobs")
    op.drop_index("ix_portability_jobs_command_id", table_name="portability_jobs")
    op.drop_column("portability_jobs", "offboarding_job_id")
    op.drop_column("portability_jobs", "expected_rows")
    op.drop_column("portability_jobs", "file_name")
    op.drop_column("portability_jobs", "recipient_pem_sha256")
    op.drop_column("portability_jobs", "recipient_pem")
    op.drop_column("portability_jobs", "command_id")
    op.drop_column("portability_jobs", "destination_deployment_id")
    op.drop_column("portability_jobs", "source_deployment_id")
    op.drop_column("portability_jobs", "requested_by_staff_id")
