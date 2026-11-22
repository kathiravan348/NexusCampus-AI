"""P06 fleet registry, latest health signals and per-deployment agent tokens (NEX-113).

Revision ID: c0006_fleet
Revises: c0005_licences
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0006_fleet"
down_revision: str | None = "c0005_licences"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64


def upgrade() -> None:
    op.create_table(
        "deployments",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=True, index=True),
        sa.Column("region", sa.String(8), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("health", sa.String(16), nullable=False),
        sa.Column("last_check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("telemetry_enabled", sa.Boolean(), nullable=False),
        sa.Column("air_gapped", sa.Boolean(), nullable=False),
        sa.Column("extension_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("tenant_count", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "(kind = 'saas_shared_cell') = (account_id IS NULL)", name="deployments_shared_cell_no_account"
        ),
        sa.CheckConstraint("telemetry_enabled OR health = 'unknown'", name="deployments_no_telemetry_unknown_health"),
        sa.CheckConstraint(
            "NOT air_gapped OR kind NOT IN ('saas_shared_cell', 'saas_dedicated_cell')",
            name="deployments_only_customer_air_gapped",
        ),
        sa.CheckConstraint(
            "NOT air_gapped OR (NOT telemetry_enabled AND last_check_in_at IS NULL)",
            name="deployments_air_gapped_no_checkin",
        ),
        sa.CheckConstraint("tenant_count >= 0", name="deployments_tenant_count_non_negative"),
    )
    op.create_table(
        "health_signals",
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("uptime_pct", sa.Numeric(), nullable=False),
        sa.Column("error_rate_pct", sa.Numeric(), nullable=False),
        sa.Column("p95_latency_ms", sa.Integer(), nullable=False),
        sa.Column("queue_depth", sa.Integer(), nullable=False),
        sa.Column("disk_used_pct", sa.Numeric(), nullable=False),
        sa.Column("active_users", sa.Integer(), nullable=False),
        sa.CheckConstraint("uptime_pct >= 0 AND uptime_pct <= 100", name="health_signals_uptime_range"),
        sa.CheckConstraint("error_rate_pct >= 0 AND error_rate_pct <= 100", name="health_signals_error_rate_range"),
        sa.CheckConstraint("disk_used_pct >= 0 AND disk_used_pct <= 100", name="health_signals_disk_used_range"),
        sa.CheckConstraint("p95_latency_ms >= 0", name="health_signals_latency_non_negative"),
        sa.CheckConstraint("queue_depth >= 0", name="health_signals_queue_non_negative"),
        sa.CheckConstraint("active_users >= 0", name="health_signals_users_non_negative"),
    )
    op.create_table(
        "deployment_agent_tokens",
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), primary_key=True),
        sa.Column("token_sha256", sa.CHAR(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.execute(f"GRANT SELECT ON deployments, health_signals, deployment_agent_tokens TO {CONTROL_APP_ROLE}")
    op.execute(
        f"GRANT UPDATE (version, health, last_check_in_at, telemetry_enabled) ON deployments TO {CONTROL_APP_ROLE}"
    )
    op.execute(f"GRANT INSERT, UPDATE ON health_signals TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("deployment_agent_tokens")
    op.drop_table("health_signals")
    op.drop_table("deployments")
