"""P10 access broker tables (broker_requests, broker_sessions, break_glass_cases) and grants (NEX-125).

Revision ID: c0017_broker
Revises: c0016_release_writes
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from nexus.control.settings import CONTROL_APP_ROLE

revision = "c0017_broker"
down_revision = "c0016_release_writes"
branch_labels = None
depends_on = None

ID = 64


def upgrade() -> None:
    op.create_table(
        "broker_requests",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False, index=True),
        sa.Column("requested_by_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("ticket_id", sa.String(ID), sa.ForeignKey("tickets.id"), nullable=True, index=True),
        sa.Column("reason", sa.String(2000), nullable=False),
        sa.Column("modules", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("duration_hours", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deployment_id", sa.String(ID), sa.ForeignKey("deployments.id"), nullable=True, index=True),
        sa.CheckConstraint("length(btrim(reason)) >= 1", name="br_reason_non_empty"),
        sa.CheckConstraint("cardinality(modules) >= 1", name="br_modules_non_empty"),
        sa.CheckConstraint("control_text_array_unique(modules)", name="br_modules_unique"),
        sa.CheckConstraint("NOT ('M83' = ANY(modules))", name="br_no_m83"),
        sa.CheckConstraint("mode IN ('read', 'edit')", name="br_mode_known"),
        sa.CheckConstraint("duration_hours >= 1 AND duration_hours <= 72", name="br_duration_range"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'denied', 'expired', 'revoked', 'ended')",
            name="br_status_known",
        ),
        sa.CheckConstraint("(status = 'pending') = (decided_at IS NULL)", name="br_decided_iff_not_pending"),
        sa.CheckConstraint("decided_at IS NULL OR decided_at >= requested_at", name="br_decided_not_before_requested"),
    )

    op.create_table(
        "broker_sessions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("request_id", sa.String(ID), sa.ForeignKey("broker_requests.id"), nullable=False, index=True),
        sa.Column("grant_id", sa.String(ID), nullable=False),
        sa.Column("staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded", sa.Boolean(), nullable=False),
        sa.Column("actions_count", sa.Integer(), nullable=False),
        sa.Column("ended_early_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("recorded", name="bs_always_recorded"),
        sa.CheckConstraint("actions_count >= 0", name="bs_actions_non_negative"),
        sa.CheckConstraint(
            "ends_at > starts_at AND ends_at <= starts_at + interval '72 hours'",
            name="bs_duration_max_72h",
        ),
        sa.CheckConstraint(
            "ended_early_at IS NULL OR (ended_early_at >= starts_at AND ended_early_at < ends_at)",
            name="bs_ended_early_in_window",
        ),
    )

    op.create_table(
        "break_glass_cases",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("justification", sa.String(4000), nullable=False),
        sa.Column("approver_staff_ids", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("institution_notified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("report_delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("category IN ('legal_order', 'security_incident')", name="bg_category_known"),
        sa.CheckConstraint("length(btrim(justification)) >= 20", name="bg_justification_min"),
        sa.CheckConstraint(
            "cardinality(approver_staff_ids) = 2 AND approver_staff_ids[1] <> approver_staff_ids[2]",
            name="bg_two_different_approvers",
        ),
        sa.CheckConstraint("institution_notified_at >= opened_at", name="bg_notified_after_open"),
        sa.CheckConstraint("report_delivered_at IS NULL OR closed_at IS NOT NULL", name="bg_report_after_close"),
        sa.CheckConstraint("closed_at IS NULL OR closed_at >= opened_at", name="bg_closed_after_open"),
        sa.CheckConstraint(
            "report_delivered_at IS NULL OR report_delivered_at >= closed_at",
            name="bg_report_not_before_close",
        ),
    )

    op.execute(f"GRANT SELECT ON broker_requests, broker_sessions, break_glass_cases TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT INSERT ON broker_requests TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status, decided_at) ON broker_requests TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT INSERT ON deployment_commands TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.execute(f"REVOKE INSERT ON deployment_commands FROM {CONTROL_APP_ROLE}")
    op.drop_table("break_glass_cases")
    op.drop_table("broker_sessions")
    op.drop_table("broker_requests")
