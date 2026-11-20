"""Sync (NEX-057, M10, O-2/O-3): device registry, sync conflicts (no payloads), generic idempotency claims.

`idempotency_keys.response` becomes nullable: a claimed key (`status_code = 0`) has no response until the write
committed and the middleware stored it.

Revision ID: 0014_sync
Revises: 0013_notifications
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_sync"
down_revision: str | None = "0013_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


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
        "devices",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("user_id", sa.String(ID), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pending_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conflict_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lost_write_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("platform IN ('web', 'android', 'ios', 'edge')", name="platform_known"),
        sa.CheckConstraint("status IN ('active', 'revoke_pending', 'revoked')", name="status_known"),
        sa.CheckConstraint("(revoked_at IS NULL) = (status <> 'revoked')", name="revoked_at_when_revoked"),
        sa.CheckConstraint(
            "pending_count >= 0 AND conflict_count >= 0 AND lost_write_count >= 0", name="counts_not_negative"
        ),
    )
    _rls("devices", "SELECT, INSERT, UPDATE")

    op.create_table(
        "sync_conflicts",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("device_id", sa.String(ID), sa.ForeignKey("devices.id"), nullable=False, index=True),
        sa.Column("module_id", sa.String(3), nullable=False),
        sa.Column("operation", sa.String(120), nullable=False),
        sa.Column("merge_rule", sa.String(32), nullable=False),
        sa.Column("summary_key", sa.String(200), nullable=False),
        sa.Column("client_version", sa.Integer(), nullable=False),
        sa.Column("server_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("resolution", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "merge_rule IN ('lww-audited', 'append-only', 'manual-review-only')", name="merge_rule_known"
        ),
        sa.CheckConstraint("status IN ('open', 'resolved')", name="status_known"),
        sa.CheckConstraint(
            "resolution IS NULL OR resolution IN ('keep_server', 'keep_client', 'merged')", name="resolution_known"
        ),
        sa.CheckConstraint("(resolution IS NULL) = (status = 'open')", name="resolution_when_resolved"),
        sa.CheckConstraint("(resolved_at IS NULL) = (status = 'open')", name="resolved_at_when_resolved"),
        sa.CheckConstraint("resolved_at IS NULL OR resolved_at >= created_at", name="resolved_after_created"),
        sa.CheckConstraint("client_version >= 0 AND server_version >= 0", name="versions_not_negative"),
    )
    _rls("sync_conflicts", "SELECT, INSERT, UPDATE")

    op.alter_column("idempotency_keys", "response", nullable=True)
    op.execute("GRANT UPDATE, DELETE ON idempotency_keys TO nexus_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE, DELETE ON idempotency_keys FROM nexus_app")
    op.execute("DELETE FROM idempotency_keys WHERE response IS NULL")
    op.alter_column("idempotency_keys", "response", nullable=False)
    op.drop_table("sync_conflicts")
    op.drop_table("devices")
