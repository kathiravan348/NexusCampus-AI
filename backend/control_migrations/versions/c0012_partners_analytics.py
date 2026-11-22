"""P12 deal registrations & commissions, P16 business metrics & account health (NEX-124).

`control_app`: SELECT only on all four tables (D23).

Revision ID: c0012_partners_analytics
Revises: c0011_delivery_extras
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0012_partners_analytics"
down_revision: str | None = "c0011_delivery_extras"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
_MONTH_RE = r"^[0-9]{4}-(0[1-9]|1[0-2])$"


def upgrade() -> None:
    op.create_table(
        "deal_registrations",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("partner_id", sa.String(ID), sa.ForeignKey("partners.id"), nullable=False, index=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.Date(), nullable=False),
        sa.CheckConstraint("status IN ('submitted', 'approved', 'rejected', 'expired')", name="deals_status_known"),
    )
    op.create_table(
        "commissions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("partner_id", sa.String(ID), sa.ForeignKey("partners.id"), nullable=False, index=True),
        sa.Column("invoice_id", sa.String(ID), sa.ForeignKey("invoices.id"), nullable=False, index=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount_minor >= 0", name="commissions_amount_non_negative"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="commissions_currency_iso"),
        sa.CheckConstraint("status IN ('pending', 'payable', 'paid')", name="commissions_status_known"),
        sa.CheckConstraint("(status = 'paid') = (paid_at IS NOT NULL)", name="commissions_paid_at_matches_status"),
    )
    op.create_table(
        "business_metrics",
        sa.Column("month", sa.String(7), primary_key=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("mrr_minor", sa.BigInteger(), nullable=False),
        sa.Column("arr_minor", sa.BigInteger(), nullable=False),
        sa.Column("active_accounts", sa.Integer(), nullable=False),
        sa.Column("new_accounts", sa.Integer(), nullable=False),
        sa.Column("churned_accounts", sa.Integer(), nullable=False),
        sa.Column("gross_churn_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("nrr_pct", sa.Numeric(6, 2), nullable=False),
        sa.Column("open_tickets", sa.Integer(), nullable=False),
        sa.CheckConstraint(f"month ~ '{_MONTH_RE}'", name="business_metrics_month_format"),
        sa.CheckConstraint("currency ~ '^[A-Z]{3}$'", name="business_metrics_currency_iso"),
        sa.CheckConstraint("mrr_minor >= 0 AND arr_minor >= 0", name="business_metrics_mrr_arr_non_negative"),
        sa.CheckConstraint("arr_minor = mrr_minor * 12", name="business_metrics_arr_eq_12_mrr"),
        sa.CheckConstraint(
            "active_accounts >= 0 AND new_accounts >= 0 AND churned_accounts >= 0 AND open_tickets >= 0",
            name="business_metrics_counts_non_negative",
        ),
        sa.CheckConstraint("new_accounts <= active_accounts", name="business_metrics_new_le_active"),
        sa.CheckConstraint("gross_churn_pct >= 0 AND gross_churn_pct <= 100", name="business_metrics_churn_range"),
        sa.CheckConstraint("nrr_pct >= 0 AND nrr_pct <= 300", name="business_metrics_nrr_range"),
    )
    op.create_table(
        "account_health",
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), primary_key=True),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("churn_risk", sa.String(16), nullable=False),
        sa.Column("reasons", ARRAY(sa.Text()), nullable=False),
        sa.Column("ai_generated", sa.Boolean(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name="account_health_score_range"),
        sa.CheckConstraint("churn_risk IN ('low', 'medium', 'high')", name="account_health_risk_known"),
        sa.CheckConstraint("cardinality(reasons) BETWEEN 1 AND 5", name="account_health_reasons_count"),
        sa.CheckConstraint("ai_generated = true", name="account_health_ai_generated_true"),
        sa.CheckConstraint("churn_risk <> 'high' OR score < 50", name="account_health_high_risk_below_50"),
        sa.CheckConstraint("churn_risk <> 'low' OR score >= 70", name="account_health_low_risk_at_least_70"),
    )

    op.execute(
        f"GRANT SELECT ON deal_registrations, commissions, business_metrics, account_health TO {CONTROL_APP_ROLE}"
    )


def downgrade() -> None:
    op.drop_table("account_health")
    op.drop_table("business_metrics")
    op.drop_table("commissions")
    op.drop_table("deal_registrations")
