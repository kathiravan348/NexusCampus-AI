"""Staff sessions (NEX-097): only the SHA-256 of the cookie token is stored; sessions expire and can be revoked.

Revision ID: c0002_staff_sessions
Revises: c0001_staff
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0002_staff_sessions"
down_revision: str | None = "c0001_staff"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "staff_sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("staff_id", sa.String(64), sa.ForeignKey("staff_users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("expires_at > created_at", name="staff_sessions_expiry_after_start"),
    )
    op.execute(f"GRANT SELECT, INSERT ON staff_sessions TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (revoked_at) ON staff_sessions TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("staff_sessions")
