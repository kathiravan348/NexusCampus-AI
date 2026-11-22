"""Lago invoice webhook storage and invoice numbering (NEX-111, D51).

Adds internal `invoices.lago_invoice_id` (unique, nullable — never exposed by the `Invoice` contract), sequence
`invoice_number_seq` (`INV-<year>-<6-digit seq>`), and `billing_webhook_events` (dedup by SHA-256 of raw body).

Revision ID: c0009_lago_invoices
Revises: c0008_release_manifests
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0009_lago_invoices"
down_revision: str | None = "c0008_release_manifests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("lago_invoice_id", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_invoices_lago_invoice_id", "invoices", ["lago_invoice_id"])
    op.execute("CREATE SEQUENCE invoice_number_seq START 1")
    op.create_table(
        "billing_webhook_events",
        sa.Column("id", sa.CHAR(64), primary_key=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("kind", sa.String(64), nullable=False),
    )
    op.execute(f"GRANT INSERT ON invoices TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT ON billing_webhook_events TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT USAGE ON SEQUENCE invoice_number_seq TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("billing_webhook_events")
    op.execute("DROP SEQUENCE invoice_number_seq")
    op.drop_constraint("uq_invoices_lago_invoice_id", "invoices", type_="unique")
    op.drop_column("invoices", "lago_invoice_id")
