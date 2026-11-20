"""Vault key metadata (NEX-050, D46): one row per tenant key (purpose, custody, state). Never key material.

Revision ID: 0007_vault_keys
Revises: 0006_sso_scim
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_vault_keys"
down_revision: str | None = "0006_sso_scim"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def upgrade() -> None:
    op.create_table(
        "vault_keys",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("custody", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("vault_key_name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "purpose"),
        sa.CheckConstraint(
            "purpose IN ('tenant_data', 'field_health', 'field_identity', 'field_finance')", name="purpose_known"
        ),
        sa.CheckConstraint("custody IN ('platform', 'byok', 'hyok')", name="custody_known"),
        sa.CheckConstraint("status IN ('active', 'rotating', 'revoked', 'destroyed')", name="status_known"),
        sa.CheckConstraint("rotated_at IS NULL OR rotated_at >= created_at", name="rotated_after_created"),
    )
    op.execute("ALTER TABLE vault_keys ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE vault_keys FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON vault_keys "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON vault_keys TO nexus_app")


def downgrade() -> None:
    op.drop_table("vault_keys")
