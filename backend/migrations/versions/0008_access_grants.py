"""Provider access (NEX-051, M83, V-3/V-5): access requests, time-boxed grants (≤ 72 h), break-glass notices.

There is no standing provider access: a provider credential is only issued for an approved, unexpired, unrevoked
grant, and every use is audited in the tenant's own log.

Revision ID: 0008_access_grants
Revises: 0007_vault_keys
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_access_grants"
down_revision: str | None = "0007_vault_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
MODULES = "cardinality(modules) >= 1"


def _tenant_table(name: str, grants: str) -> None:
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
        "access_requests",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("staff_ref", sa.String(ID), nullable=False),
        sa.Column("staff_display_name", sa.String(200), nullable=False),
        sa.Column("reason", sa.String(2000), nullable=False),
        sa.Column("modules", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("duration_hours", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by", sa.String(ID), nullable=True),
        sa.CheckConstraint(MODULES, name="modules_not_empty"),
        sa.CheckConstraint("mode IN ('read', 'edit')", name="mode_known"),
        sa.CheckConstraint("duration_hours BETWEEN 1 AND 72", name="duration_bounded"),
        sa.CheckConstraint("status IN ('pending', 'approved', 'denied', 'expired', 'revoked')", name="status_known"),
        sa.CheckConstraint("(decided_at IS NULL) = (status = 'pending')", name="decided_at_when_decided"),
        sa.CheckConstraint("(decided_by IS NULL) = (status = 'pending')", name="decided_by_when_decided"),
        sa.CheckConstraint("decided_at IS NULL OR decided_at >= requested_at", name="decided_after_requested"),
    )
    _tenant_table("access_requests", "SELECT, INSERT, UPDATE")

    op.create_table(
        "access_grants",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("request_id", sa.String(ID), sa.ForeignKey("access_requests.id"), nullable=False, unique=True),
        sa.Column("modules", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("mode", sa.String(8), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(MODULES, name="modules_not_empty"),
        sa.CheckConstraint("mode IN ('read', 'edit')", name="mode_known"),
        sa.CheckConstraint("ends_at > starts_at", name="ends_after_start"),
        sa.CheckConstraint("ends_at - starts_at <= interval '72 hours'", name="at_most_72_hours"),
        sa.CheckConstraint(
            "revoked_at IS NULL OR (revoked_at >= starts_at AND revoked_at < ends_at)", name="revoked_in_window"
        ),
    )
    _tenant_table("access_grants", "SELECT, INSERT, UPDATE")

    op.create_table(
        "break_glass_notices",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("approver_refs", postgresql.ARRAY(sa.String(ID)), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("report_url", sa.String(2048), nullable=True),
        sa.CheckConstraint("category IN ('legal_order', 'security_incident')", name="category_known"),
        sa.CheckConstraint(
            "cardinality(approver_refs) = 2 AND approver_refs[1] <> approver_refs[2]", name="two_distinct_approvers"
        ),
        sa.CheckConstraint("notified_at >= occurred_at", name="notified_after_occurred"),
    )
    # Break-glass notices are created by the provider plane (Stage 2); the app only reads them.
    _tenant_table("break_glass_notices", "SELECT")


def downgrade() -> None:
    op.drop_table("break_glass_notices")
    op.drop_table("access_grants")
    op.drop_table("access_requests")
