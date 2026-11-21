"""Control database baseline (NEX-096): app role `control_app` and staff tables (P13).

Revision ID: c0001_staff
Revises:
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE, get_control_settings

revision: str = "c0001_staff"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _password() -> str:
    value = context.config.attributes.get("app_db_password")
    if not isinstance(value, str) or not value:
        value = get_control_settings().app_password()
    return value


def upgrade() -> None:
    # Roles are cluster-wide: create once, then (re)set the password (quoted by doubling quotes; DDL cannot bind).
    password = _password().replace("'", "''")
    op.execute(
        f"""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{CONTROL_APP_ROLE}') THEN
            CREATE ROLE {CONTROL_APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
          END IF;
        END $$;
        """
    )
    op.execute(f"ALTER ROLE {CONTROL_APP_ROLE} PASSWORD '{password}'")

    op.create_table(
        "staff_users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("work_email", sa.String(320), nullable=False, unique=True),
        sa.Column("roles", ARRAY(sa.Text()), nullable=False),
        sa.Column("partner_id", sa.String(64), nullable=True),
        sa.Column("mfa_enrolled", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("cardinality(roles) >= 1", name="staff_users_has_role"),
        sa.CheckConstraint(
            "('partner' = ANY(roles)) = (partner_id IS NOT NULL)", name="staff_users_partner_matches_role"
        ),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role", sa.String(32), primary_key=True),
        sa.Column("permission", sa.String(64), primary_key=True),
    )
    # The app reads staff and permissions; it records sign-ins only (staff are managed through migrations / seed
    # until staff management arrives).
    op.execute(f"GRANT CONNECT ON DATABASE {op.get_bind().engine.url.database} TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT SELECT ON staff_users, role_permissions TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (last_sign_in_at) ON staff_users TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("role_permissions")
    op.drop_table("staff_users")
