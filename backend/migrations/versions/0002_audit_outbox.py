"""Audit core (NEX-044): append-only hash-chained `audit_events`, `audit_chain_heads`, and the domain event
outbox `domain_events_outbox`; all with forced Row-Level Security.

Revision ID: 0002_audit_outbox
Revises: 0001_tenancy
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002_audit_outbox"
down_revision: str | None = "0001_tenancy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "nexus_app"
ID = 128

#: Owner-only maintenance switch: `SET LOCAL nexus.audit_maintenance = 'on'` lets the dev seed reset delete
#: demo audit rows. Nothing can ever UPDATE an audit row.
GUARD = """
CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('nexus.audit_maintenance', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
"""


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("seq", sa.BigInteger(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_kind", sa.String(16), nullable=False),
        sa.Column("actor_id", sa.String(ID), nullable=True),
        sa.Column("grant_id", sa.String(ID), nullable=True),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("module_id", sa.String(3), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=False),
        sa.Column("target_id", sa.String(ID), nullable=True),
        sa.Column("device_id", sa.String(ID), nullable=True),
        sa.Column("changes", JSONB(), nullable=False),
        sa.Column("prev_hash", sa.String(64), nullable=True),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.UniqueConstraint("tenant_id", "seq"),
        sa.CheckConstraint("seq >= 1", name="seq_positive"),
        sa.CheckConstraint("(grant_id IS NOT NULL) = (actor_kind = 'provider_grant')", name="grant_iff_provider"),
        sa.CheckConstraint("(actor_id IS NULL) = (actor_kind = 'system')", name="actor_iff_not_system"),
        sa.CheckConstraint("actor_kind IN ('user', 'system', 'provider_grant')", name="actor_kind_known"),
        sa.CheckConstraint("action LIKE lower(module_id) || '.%'", name="action_starts_with_module"),
        sa.CheckConstraint("hash ~ '^[0-9a-f]{64}$'", name="hash_hex"),
        sa.CheckConstraint("prev_hash IS NULL OR prev_hash ~ '^[0-9a-f]{64}$'", name="prev_hash_hex"),
        sa.CheckConstraint("(seq = 1) = (prev_hash IS NULL)", name="only_first_has_no_prev"),
    )
    op.create_table(
        "audit_chain_heads",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("last_seq", sa.BigInteger(), nullable=False),
        sa.Column("last_hash", sa.String(64), nullable=True),
    )
    op.create_table(
        "domain_events_outbox",
        sa.Column("event_id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("module_id", sa.String(3), nullable=False),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_id", sa.String(ID), nullable=True),
        sa.Column("correlation_id", sa.String(ID), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("payload", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("event_type LIKE lower(module_id) || '.%'", name="type_starts_with_module"),
        sa.CheckConstraint("schema_version >= 1", name="schema_version_positive"),
    )

    for table in ("audit_events", "audit_chain_heads", "domain_events_outbox"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )

    # Append-only for the app: read + insert only (the chain head is updated by the writer).
    op.execute(f"GRANT SELECT, INSERT ON audit_events TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON audit_chain_heads TO {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON domain_events_outbox TO {APP_ROLE}")
    # And for every role, including the owner: no UPDATE ever; DELETE only in owner maintenance (dev reset).
    op.execute(GUARD)
    op.execute(
        "CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events "
        "FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()"
    )
    op.execute(
        "CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events "
        "FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only()"
    )


def downgrade() -> None:
    op.drop_table("domain_events_outbox")
    op.drop_table("audit_chain_heads")
    op.drop_table("audit_events")
    op.execute("DROP FUNCTION IF EXISTS audit_events_append_only()")
