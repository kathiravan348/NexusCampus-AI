"""P04 offboarding writes, four-eyes approval columns, and shred certificate grants (D61, NEX-134).

Revision ID: c0019_offboarding_writes
Revises: c0018_provisioning_writes
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0019_offboarding_writes"
down_revision = "c0018_provisioning_writes"
branch_labels = None
depends_on = None

ID = 64


def upgrade() -> None:
    op.add_column(
        "offboarding_jobs",
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=True),
    )
    op.add_column(
        "offboarding_jobs",
        sa.Column("command_id", sa.String(ID), sa.ForeignKey("deployment_commands.id"), nullable=True),
    )
    op.add_column("offboarding_jobs", sa.Column("recipient_pem", sa.Text(), nullable=True))
    op.add_column("offboarding_jobs", sa.Column("recipient_pem_sha256", sa.String(64), nullable=True))
    op.add_column("offboarding_jobs", sa.Column("export_result", JSONB(), nullable=True))
    op.add_column(
        "offboarding_jobs",
        sa.Column("approver_1_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=True),
    )
    op.add_column(
        "offboarding_jobs",
        sa.Column("approver_2_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=True),
    )
    op.create_index("ix_offboarding_jobs_command_id", "offboarding_jobs", ["command_id"])
    op.create_check_constraint(
        "offb_two_distinct_approvers",
        "offboarding_jobs",
        "approver_1_staff_id IS NULL OR approver_2_staff_id IS NULL OR approver_1_staff_id <> approver_2_staff_id",
    )

    op.execute(f"GRANT INSERT ON offboarding_jobs TO {CONTROL_APP_ROLE}")
    op.execute(
        "GRANT UPDATE (steps, status, shred_certificate_id, command_id, recipient_pem, export_result, "
        f"approver_1_staff_id, approver_2_staff_id) ON offboarding_jobs TO {CONTROL_APP_ROLE}"
    )
    op.execute(f"GRANT INSERT ON shred_certificates TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE INSERT ON shred_certificates FROM {CONTROL_APP_ROLE}")
    op.execute(f"REVOKE INSERT, UPDATE ON offboarding_jobs FROM {CONTROL_APP_ROLE}")
    op.drop_constraint("offb_two_distinct_approvers", "offboarding_jobs", type_="check")
    op.drop_index("ix_offboarding_jobs_command_id", table_name="offboarding_jobs")
    op.drop_column("offboarding_jobs", "approver_2_staff_id")
    op.drop_column("offboarding_jobs", "approver_1_staff_id")
    op.drop_column("offboarding_jobs", "export_result")
    op.drop_column("offboarding_jobs", "recipient_pem_sha256")
    op.drop_column("offboarding_jobs", "recipient_pem")
    op.drop_column("offboarding_jobs", "command_id")
    op.drop_column("offboarding_jobs", "deployment_id")
