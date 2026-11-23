"""Tenant freeze timestamp for P04 offboarding (D61, NEX-133).

Adds nullable `tenants.frozen_at`. Only the DB owner role may set or clear `frozen_at`; `nexus_app` gets
column-scoped UPDATE on the non-freeze columns so the application role can never unfreeze a tenant.

Revision ID: 0022_tenant_freeze
Revises: 0021_broker_reports
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_tenant_freeze"
down_revision: str | None = "0021_broker_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "nexus_app"


def upgrade() -> None:
    op.add_column("tenants", sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(f"REVOKE UPDATE ON tenants FROM {APP_ROLE}")
    op.execute(f"GRANT UPDATE (name, type, region, updated_at) ON tenants TO {APP_ROLE}")


def downgrade() -> None:
    op.execute(f"GRANT UPDATE ON tenants TO {APP_ROLE}")
    op.drop_column("tenants", "frozen_at")
