"""Razorpay payment links and Lago payment-sync flag (P03, D62, NEX-107).

Revision ID: c0021_payment_links
Revises: c0020_portability_writes
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0021_payment_links"
down_revision = "c0020_portability_writes"
branch_labels = None
depends_on = None

ID = 64


def upgrade() -> None:
    op.create_table(
        "payment_links",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("invoice_id", sa.String(ID), sa.ForeignKey("invoices.id"), nullable=False, index=True),
        sa.Column("gateway", sa.String(16), nullable=False),
        sa.Column("gateway_link_id", sa.String(128), nullable=False),
        sa.Column("short_url", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("gateway_link_id", name="uq_payment_links_gateway_link_id"),
        sa.CheckConstraint("gateway IN ('razorpay', 'stripe')", name="payment_links_gateway_known"),
        sa.CheckConstraint("status IN ('created', 'paid', 'expired', 'cancelled')", name="payment_links_status_known"),
        sa.CheckConstraint("expires_at > created_at", name="payment_links_expiry_after_create"),
    )
    op.add_column(
        "payments",
        sa.Column("lago_synced", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.execute(f"GRANT SELECT, INSERT ON payment_links TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status) ON payment_links TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (lago_synced) ON payments TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE UPDATE (lago_synced) ON payments FROM {CONTROL_APP_ROLE}")
    op.execute(f"REVOKE SELECT, INSERT, UPDATE ON payment_links FROM {CONTROL_APP_ROLE}")
    op.drop_column("payments", "lago_synced")
    op.drop_table("payment_links")
