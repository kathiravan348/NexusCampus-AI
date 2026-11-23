"""Agent command replay guard table (M84, D60, NEX-129). Install-wide; no tenant data.

Revision ID: 0020_agent_commands
Revises: 0019_install_active_users
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_agent_commands"
down_revision: str | None = "0019_install_active_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_commands",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('running', 'done', 'failed', 'rejected')",
            name="agent_commands_status",
        ),
        sa.CheckConstraint(
            "(status = 'running') = (finished_at IS NULL)",
            name="agent_commands_finished",
        ),
    )
    op.execute("GRANT SELECT, INSERT ON agent_commands TO nexus_app")
    op.execute("GRANT UPDATE (status, finished_at) ON agent_commands TO nexus_app")


def downgrade() -> None:
    op.drop_table("agent_commands")
