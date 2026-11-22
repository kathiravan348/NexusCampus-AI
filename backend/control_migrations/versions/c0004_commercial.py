"""P02 catalogue & quotes, P03 billing, P11 usage (NEX-102). Metadata and counts only (V-7).

Revision ID: c0004_commercial
Revises: c0003_accounts
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0004_commercial"
down_revision: str | None = "c0003_accounts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
TABLES = (
    "catalogue_items",
    "quotes",
    "subscriptions",
    "invoices",
    "payments",
    "credit_notes",
    "dunning_states",
    "usage_records",
)


def upgrade() -> None:
    op.create_table(
        "catalogue_items",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("modules", ARRAY(sa.Text()), nullable=False),
        sa.Column("unit", sa.String(24), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=True),
        sa.Column("prices", JSONB(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "(kind = 'ai_credit_pack') = (credits IS NOT NULL)", name="catalogue_credits_only_for_packs"
        ),
    )
    op.create_table(
        "quotes",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False),
        sa.Column("total_minor", sa.BigInteger(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("ai_drafted", sa.Boolean(), nullable=False),
        sa.Column("created_by_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("total_minor = subtotal_minor + tax_minor", name="quotes_totals_add_up"),
    )
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False),
        sa.Column("plan_item_id", sa.String(ID), sa.ForeignKey("catalogue_items.id"), nullable=False),
        sa.Column("addon_item_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("period", sa.String(8), nullable=False),
        sa.Column("learners", sa.Integer(), nullable=False),
        sa.Column("current_period_start", sa.Date(), nullable=False),
        sa.Column("current_period_end", sa.Date(), nullable=False),
        sa.Column("trial_ends_at", sa.Date(), nullable=True),
        sa.CheckConstraint(
            "(status = 'trialing') = (trial_ends_at IS NOT NULL)", name="subscriptions_trial_end_iff_trial"
        ),
    )
    op.create_table(
        "invoices",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("tax_scheme", sa.String(8), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False),
        sa.Column("total_minor", sa.BigInteger(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("total_minor = subtotal_minor + tax_minor", name="invoices_totals_add_up"),
        sa.CheckConstraint("(status = 'paid') = (paid_at IS NOT NULL)", name="invoices_paid_at_iff_paid"),
        sa.CheckConstraint("due_date >= issue_date", name="invoices_due_after_issue"),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("invoice_id", sa.String(ID), sa.ForeignKey("invoices.id"), nullable=False, index=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("gateway", sa.String(16), nullable=False),
        sa.Column("gateway_ref", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("gateway = 'manual' OR gateway_ref IS NOT NULL", name="payments_gateway_needs_ref"),
    )
    op.create_table(
        "credit_notes",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("invoice_id", sa.String(ID), sa.ForeignKey("invoices.id"), nullable=False, index=True),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "dunning_states",
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), primary_key=True),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("overdue_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("next_step_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "usage_records",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("deployment_id", sa.String(ID), nullable=True),
        sa.Column("tenant_id", sa.String(ID), nullable=True),
        sa.Column("metric", sa.String(16), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity", sa.BigInteger(), nullable=False),
        sa.Column("cap", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("deployment_id IS NOT NULL OR tenant_id IS NOT NULL", name="usage_belongs_somewhere"),
        sa.CheckConstraint("period_end > period_start", name="usage_period_order"),
    )
    # The app reads everything. It may only: send a quote, pay an invoice by bank transfer (add the payment, clear
    # dunning, re-activate past-due subscriptions). No deletes anywhere (D23).
    op.execute(f"GRANT SELECT ON {', '.join(TABLES)} TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status) ON quotes TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status, paid_at) ON invoices TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT INSERT ON payments TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (stage, overdue_minor, next_step_at) ON dunning_states TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status) ON subscriptions TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
