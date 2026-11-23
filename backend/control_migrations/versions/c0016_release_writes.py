"""Column-scoped UPDATE grants on P07 releases and rollouts (NEX-130).

Revision ID: c0016_release_writes
Revises: c0015_deployment_commands
Create Date: 2026-11-23
"""

from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0016_release_writes"
down_revision = "c0015_deployment_commands"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(f"GRANT UPDATE (status, signed, published_at) ON releases TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status, started_at) ON rollouts TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE ON releases, rollouts FROM {CONTROL_APP_ROLE}")
