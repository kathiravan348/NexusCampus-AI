"""Install-wide active user count for M84 health reports (NEX-114).

`nexus_install_active_users(since timestamptz)` (SECURITY DEFINER, owner-owned) counts distinct `sessions.user_id`
active after `since` across all tenants and returns a single integer — never a person, tenant or session row (V-7).

Revision ID: 0019_install_active_users
Revises: 0018_install_jobs
Create Date: 2026-11-22
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0019_install_active_users"
down_revision: str | None = "0018_install_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE FUNCTION nexus_install_active_users(since timestamptz) RETURNS integer "
        "LANGUAGE sql STABLE SECURITY DEFINER "
        "SET search_path = pg_catalog, public AS $$ "
        "SELECT count(DISTINCT user_id)::integer FROM sessions WHERE last_seen_at > since $$"
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_install_active_users(timestamptz) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_install_active_users(timestamptz) TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS nexus_install_active_users(timestamptz)")
