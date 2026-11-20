"""Plans and usage (NEX-055, M05): the plan catalogue (global), each tenant's plan, usage meters per period.

`plans` is platform reference data (no tenant column, read-only for the app); plan changes come from Nexus Control
(Stage 2). Module switches stay in `entitlements` (0004).

Revision ID: 0012_plans_usage
Revises: 0011_text_overrides
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_plans_usage"
down_revision: str | None = "0011_text_overrides"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
METRICS = "('learners', 'staff', 'storage_bytes', 'ai_credits', 'sms', 'email')"


def _rls(name: str, grants: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {name} "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute(f"GRANT {grants} ON {name} TO nexus_app")


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("name_key", sa.String(200), nullable=False),
        sa.Column("modules", postgresql.ARRAY(sa.String(3)), nullable=False, server_default="{}"),
        sa.Column("ai_credits_per_month", sa.Integer(), nullable=False),
        sa.Column("learner_limit", sa.Integer(), nullable=True),
        sa.CheckConstraint("ai_credits_per_month >= 0", name="credits_not_negative"),
        sa.CheckConstraint("learner_limit IS NULL OR learner_limit >= 1", name="learner_limit_positive"),
    )
    op.execute("GRANT SELECT ON plans TO nexus_app")

    op.create_table(
        "tenant_plans",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("plan_id", sa.String(ID), sa.ForeignKey("plans.id"), nullable=False),
    )
    _rls("tenant_plans", "SELECT")

    op.create_table(
        "usage_meters",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("metric", sa.String(32), primary_key=True),
        sa.Column("period_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.BigInteger(), nullable=False),
        sa.Column("limit", sa.BigInteger(), nullable=True),
        sa.CheckConstraint(f"metric IN {METRICS}", name="metric_known"),
        sa.CheckConstraint("period_end > period_start", name="period_ordered"),
        sa.CheckConstraint('used >= 0 AND ("limit" IS NULL OR "limit" >= 0)', name="counts_not_negative"),
    )
    _rls("usage_meters", "SELECT, INSERT, UPDATE")


def downgrade() -> None:
    op.drop_table("usage_meters")
    op.drop_table("tenant_plans")
    op.drop_table("plans")
