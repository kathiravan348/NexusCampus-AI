"""Signed audit checkpoints (NEX-065, ARCHITECTURE §6): once a day, each tenant's audit chain head is signed with an
Ed25519 key held in Vault. Rows are append-only for the app (SELECT, INSERT).

`nexus_audit_tenants()` (SECURITY DEFINER, owner-owned) returns only the ids of tenants that have an audit chain —
never audit data — so the checkpoint job needs no cross-tenant read access.

Revision ID: 0016_audit_checkpoints
Revises: 0015_ai
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_audit_checkpoints"
down_revision: str | None = "0015_ai"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def upgrade() -> None:
    op.create_table(
        "audit_checkpoints",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("head_seq", sa.BigInteger(), nullable=False),
        sa.Column("head_hash", sa.String(64), nullable=False),
        sa.Column("signature", sa.String(256), nullable=False),
        sa.Column("key_name", sa.String(ID), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "day", name="one_checkpoint_per_day"),
        sa.CheckConstraint("head_seq >= 1", name="head_seq_positive"),
        sa.CheckConstraint("signature LIKE 'vault:v%:%'", name="signature_format"),
    )
    op.execute("ALTER TABLE audit_checkpoints ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_checkpoints FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON audit_checkpoints "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("GRANT SELECT, INSERT ON audit_checkpoints TO nexus_app")
    op.execute(
        "CREATE FUNCTION nexus_audit_tenants() RETURNS SETOF varchar LANGUAGE sql STABLE SECURITY DEFINER "
        "SET search_path = public AS $$ SELECT tenant_id FROM audit_chain_heads WHERE last_seq > 0 $$"
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_audit_tenants() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_audit_tenants() TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION nexus_audit_tenants()")
    op.drop_table("audit_checkpoints")
