"""Install-level broker decision reporting tracker (M84/M83, D60, NEX-131).

`nexus_broker_request_statuses(ids text[])` (SECURITY DEFINER, owner-owned) returns only `(request_id, status,
decided_at)` for command-filed M83 requests so the agent can sync decisions without weakening RLS or reading
reason/modules/tenant data (V-1, V-7).

Revision ID: 0021_broker_reports
Revises: 0020_agent_commands
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_broker_reports"
down_revision: str | None = "0020_agent_commands"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "broker_reports",
        sa.Column("request_id", sa.String(64), primary_key=True),
        sa.Column("last_status", sa.String(16), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "last_status IS NULL OR last_status IN ('approved', 'denied', 'expired', 'revoked')",
            name="broker_reports_status",
        ),
        sa.CheckConstraint("(last_status IS NULL) = (reported_at IS NULL)", name="broker_reports_reported_at"),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON broker_reports TO nexus_app")
    op.execute(
        "CREATE FUNCTION nexus_broker_request_statuses(ids text[]) "
        "RETURNS TABLE (request_id text, status text, decided_at timestamptz) "
        "LANGUAGE sql STABLE SECURITY DEFINER "
        "SET search_path = pg_catalog, public AS $$ "
        "SELECT r.id::text, "
        "CASE WHEN r.status = 'approved' AND g.revoked_at IS NULL AND g.ends_at <= now() THEN 'expired' "
        "ELSE r.status END::text, "
        "CASE WHEN r.status = 'revoked' THEN COALESCE(g.revoked_at, r.decided_at) "
        "WHEN r.status = 'approved' AND g.revoked_at IS NULL AND g.ends_at <= now() "
        "THEN COALESCE(g.ends_at, r.decided_at) "
        "ELSE r.decided_at END "
        "FROM access_requests r LEFT JOIN access_grants g ON g.request_id = r.id "
        "WHERE r.id = ANY(ids) $$"
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_broker_request_statuses(text[]) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_broker_request_statuses(text[]) TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS nexus_broker_request_statuses(text[])")
    op.drop_table("broker_reports")
