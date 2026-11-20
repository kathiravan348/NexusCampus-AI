"""SSO providers and SCIM tokens (NEX-049, D44): per-tenant identity providers (no secrets) and hashed SCIM
bearer tokens; forced Row-Level Security.

Revision ID: 0006_sso_scim
Revises: 0005_guardian_links
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_sso_scim"
down_revision: str | None = "0005_guardian_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def upgrade() -> None:
    op.create_table(
        "sso_providers",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("institution_id", sa.String(ID), nullable=True),
        sa.Column("protocol", sa.String(16), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("issuer_url", sa.String(2048), nullable=False),
        sa.Column("client_id", sa.String(256), nullable=False),
        sa.Column("domains", sa.ARRAY(sa.String(253)), nullable=False),
        sa.Column("scim_enabled", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.CheckConstraint("protocol IN ('oidc', 'saml2')", name="protocol_known"),
        sa.CheckConstraint("issuer_url LIKE 'https://%'", name="issuer_https"),
        sa.CheckConstraint("cardinality(domains) >= 1", name="has_domains"),
    )
    op.create_table(
        "scim_tokens",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_hex"),
    )
    for table in ("sso_providers", "scim_tokens"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE ON {table} TO nexus_app")


def downgrade() -> None:
    op.drop_table("scim_tokens")
    op.drop_table("sso_providers")
