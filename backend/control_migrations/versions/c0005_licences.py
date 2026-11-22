"""P05 licences (NEX-103): terms, state, fingerprint and the signature of the current signed file.

Revision ID: c0005_licences
Revises: c0004_commercial
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0005_licences"
down_revision: str | None = "c0004_commercial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64


def upgrade() -> None:
    op.create_table(
        "licences",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("edition", sa.String(16), nullable=False),
        sa.Column("modules", ARRAY(sa.Text()), nullable=False),
        sa.Column("learner_cap", sa.Integer(), nullable=False),
        sa.Column("campus_cap", sa.Integer(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("support_ends_at", sa.Date(), nullable=False),
        sa.Column("grace_days", sa.Integer(), nullable=False),
        sa.Column("activation", sa.String(8), nullable=False),
        sa.Column("signing_key_id", sa.String(64), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("deployment_id", sa.String(ID), nullable=True),
        sa.Column("signature", sa.String(88), nullable=True),
        sa.Column("signed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("signed = (signature IS NOT NULL)", name="licences_signed_iff_signature"),
        sa.CheckConstraint("expires_at IS NULL OR expires_at >= issued_at::date", name="licences_expiry_after_issue"),
        sa.CheckConstraint(
            "expires_at IS NOT NULL OR state NOT IN ('grace', 'expired')", name="licences_perpetual_never_expires"
        ),
    )
    op.execute(f"GRANT SELECT ON licences TO {CONTROL_APP_ROLE}")
    # Renewing and first signing change terms and signature together; nothing else, and no deletes.
    op.execute(
        "GRANT UPDATE (issued_at, expires_at, support_ends_at, state, signing_key_id, fingerprint, signature, signed)"
        f" ON licences TO {CONTROL_APP_ROLE}"
    )


def downgrade() -> None:
    op.drop_table("licences")
