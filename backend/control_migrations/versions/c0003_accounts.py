"""P01 accounts & CRM (NEX-101): partners, accounts, contacts, opportunities, contracts, notes. Metadata only (V-7).

Revision ID: c0003_accounts
Revises: c0002_staff_sessions
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0003_accounts"
down_revision: str | None = "c0002_staff_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
TABLES = ("partners", "accounts", "account_contacts", "opportunities", "contracts", "account_notes")


def upgrade() -> None:
    op.create_table(
        "partners",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("commission_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "accounts",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("institution_type", sa.String(8), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("region", sa.String(8), nullable=False),
        sa.Column("delivery_model", sa.String(16), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("owner_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("partner_id", sa.String(ID), sa.ForeignKey("partners.id"), nullable=True, index=True),
        sa.Column("tenant_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("learner_count", sa.Integer(), nullable=False),
        sa.Column("health_score", sa.Integer(), nullable=False),
        sa.Column("renewal_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "delivery_model <> 'self_hosted' OR cardinality(tenant_ids) = 0", name="accounts_self_hosted_no_tenants"
        ),
        sa.CheckConstraint("health_score BETWEEN 0 AND 100", name="accounts_health_score_range"),
    )
    op.create_table(
        "account_contacts",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("work_email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
    )
    op.create_table(
        "opportunities",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("stage", sa.String(16), nullable=False),
        sa.Column("value_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("close_date", sa.Date(), nullable=False),
        sa.Column("owner_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
    )
    op.create_table(
        "contracts",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), nullable=False),
        sa.Column("value_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("sla_tier", sa.String(16), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.CheckConstraint(
            "(kind = 'licence_perpetual') = (end_date IS NULL)", name="contracts_only_perpetual_without_end"
        ),
    )
    op.create_table(
        "account_notes",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("author_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("body", sa.String(2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # The app reads all of it and may only add notes; account data changes through sales flows (later tasks).
    op.execute(f"GRANT SELECT ON {', '.join(TABLES)} TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT INSERT ON account_notes TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
