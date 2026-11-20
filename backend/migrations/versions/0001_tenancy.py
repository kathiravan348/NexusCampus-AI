"""Tenancy core with Row-Level Security (NEX-043): tenants, groups, institutions, campuses, academic
calendars, and the app role `nexus_app` (LOGIN, no BYPASSRLS).

Revision ID: 0001_tenancy
Revises:
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects.postgresql import JSONB

from nexus.settings import get_settings

revision: str = "0001_tenancy"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "nexus_app"
TENANT_TABLES = ("groups", "institutions", "campuses", "academic_calendars")
ID = 128


def _timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _app_password() -> str:
    value = context.config.attributes.get("app_db_password")
    if not isinstance(value, str) or not value:
        value = get_settings().app_db_password.get_secret_value()
    if not value:
        raise RuntimeError("Set NEXUS_APP_DB_PASSWORD (backend/.env) before migrating.")
    return value


def _create_app_role() -> None:
    # Roles are cluster-wide: create once, then (re)set the password. The literal is quoted by doubling quotes
    # (standard_conforming_strings is on), because PostgreSQL cannot bind parameters in DDL.
    password = _app_password().replace("'", "''")
    op.execute(
        f"""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
            CREATE ROLE {APP_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
          END IF;
        END $$;
        """
    )
    op.execute(f"ALTER ROLE {APP_ROLE} PASSWORD '{password}'")


def upgrade() -> None:
    _create_app_role()

    op.create_table(
        "tenants",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("region", sa.String(32), nullable=False),
        *_timestamps(),
    )
    op.create_table(
        "groups",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("region", sa.String(32), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("id", "tenant_id"),
    )
    op.create_table(
        "institutions",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("group_id", sa.String(ID), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("region", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("default_locale", sa.String(35), nullable=False),
        sa.Column("supported_locales", sa.ARRAY(sa.String(35)), nullable=False),
        sa.Column("time_zone", sa.String(64), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("weekend_days", sa.ARRAY(sa.SmallInteger()), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("id", "tenant_id"),
        sa.ForeignKeyConstraint(["group_id", "tenant_id"], ["groups.id", "groups.tenant_id"]),
        sa.CheckConstraint("cardinality(supported_locales) >= 1", name="supported_locales_not_empty"),
        sa.CheckConstraint("default_locale = ANY (supported_locales)", name="default_locale_supported"),
        sa.CheckConstraint(
            "weekend_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]", name="weekend_days_are_weekdays"
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_not_before_created"),
    )
    op.create_table(
        "campuses",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("code", sa.String(16), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("time_zone", sa.String(64), nullable=True),
        sa.Column("address", JSONB(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("institution_id", "code"),
        sa.ForeignKeyConstraint(
            ["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]
        ),
        sa.CheckConstraint("code ~ '^[A-Z0-9-]{1,16}$'", name="code_format"),
    )
    op.create_table(
        "academic_calendars",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("academic_year", sa.String(20), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("display_calendar", sa.String(32), nullable=False),
        sa.Column("periods", JSONB(), nullable=False),
        sa.Column("holidays", JSONB(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]
        ),
        sa.CheckConstraint("ends_on >= starts_on", name="year_not_reversed"),
    )

    # Row-Level Security, forced (also for the table owner). `current_setting(..., true)` is NULL without a
    # tenant context, so no rows match: deny by default.
    rls = [("tenants", "id"), *[(t, "tenant_id") for t in TENANT_TABLES]]
    for table, column in rls:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({column} = current_setting('app.tenant_id', true)) "
            f"WITH CHECK ({column} = current_setting('app.tenant_id', true))"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    # The app never creates tenants (provisioning is Nexus Control, Stage 2): no INSERT/DELETE on tenants.
    op.execute(f"REVOKE INSERT, DELETE ON tenants FROM {APP_ROLE}")


def downgrade() -> None:
    for table in ("academic_calendars", "campuses", "institutions", "groups", "tenants"):
        op.drop_table(table)
    op.execute(
        f"""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
            EXECUTE 'REVOKE ALL ON SCHEMA public FROM {APP_ROLE}';
          END IF;
        END $$;
        """
    )
