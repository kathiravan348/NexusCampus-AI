"""Identity (NEX-045): people, users, role profiles, sessions — forced Row-Level Security. Credentials stay in
Keycloak (D44); sessions keep only a SHA-256 of their token.

Revision ID: 0003_identity
Revises: 0002_audit_outbox
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_identity"
down_revision: str | None = "0002_audit_outbox"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "nexus_app"
ID = 128
TABLES = ("people", "users", "role_profiles", "sessions")


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True)


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("legal_name", sa.String(200), nullable=False),
        sa.Column("preferred_name", sa.String(200), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("is_minor", sa.Boolean(), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("phone", sa.String(16), nullable=True),
        sa.Column("preferred_locale", sa.String(35), nullable=True),
        sa.Column("retention_state", sa.String(32), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("id", "tenant_id"),
        sa.CheckConstraint("phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$'", name="phone_e164"),
        sa.CheckConstraint("retention_state IN ('active', 'archived', 'crypto_shredded')", name="retention_known"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("person_id", sa.String(ID), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False),
        sa.Column("passkey_count", sa.Integer(), nullable=False),
        sa.Column("sso_only", sa.Boolean(), nullable=False),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idp_subject", sa.String(255), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("id", "tenant_id"),
        sa.ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.CheckConstraint("status IN ('invited', 'active', 'suspended', 'locked')", name="status_known"),
        sa.CheckConstraint("passkey_count >= 0", name="passkeys_not_negative"),
    )
    op.create_index("uq_users_tenant_email", "users", ["tenant_id", sa.text("lower(email)")], unique=True)
    op.create_index(
        "uq_users_tenant_idp_subject",
        "users",
        ["tenant_id", "idp_subject"],
        unique=True,
        postgresql_where=sa.text("idp_subject IS NOT NULL"),
    )
    op.create_table(
        "role_profiles",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("person_id", sa.String(ID), nullable=False),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("campus_id", sa.String(ID), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("academic_year_id", sa.String(ID), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.CheckConstraint("kind IN ('staff', 'guardian', 'learner', 'alumni', 'external')", name="kind_known"),
        sa.CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="status_known"),
        sa.CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="effective_range"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("user_id", sa.String(ID), nullable=False, index=True),
        sa.Column("device_id", sa.String(ID), nullable=False),
        sa.Column("device_label", sa.String(200), nullable=False),
        sa.Column("auth_method", sa.String(32), nullable=False),
        sa.Column("mfa_verified", sa.Boolean(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"]),
        sa.CheckConstraint("auth_method IN ('password', 'sso', 'passkey')", name="auth_method_known"),
        sa.CheckConstraint("last_seen_at >= created_at", name="seen_after_created"),
        sa.CheckConstraint("expires_at > created_at", name="expires_after_created"),
        sa.CheckConstraint("revoked_at IS NULL OR revoked_at >= created_at", name="revoked_after_created"),
        sa.CheckConstraint("token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_hex"),
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON people, users, role_profiles TO {APP_ROLE}")
    # Sessions are revoked, never deleted by the app (they are evidence for M02's session list and audit).
    op.execute(f"GRANT SELECT, INSERT, UPDATE ON sessions TO {APP_ROLE}")


def downgrade() -> None:
    for table in ("sessions", "role_profiles", "users", "people"):
        op.drop_table(table)
