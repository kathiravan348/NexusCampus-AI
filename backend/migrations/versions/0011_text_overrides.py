"""Text overrides and their revisions (NEX-054, M04, C-2, D28).

One override per tenant + scope + locale + key. Deleting keeps the row (`deleted_at`) so its id and history live
on; every change appends a revision (`message` NULL = deleted), which rollback restores from.

Revision ID: 0011_text_overrides
Revises: 0010_themes_fonts
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_text_overrides"
down_revision: str | None = "0010_themes_fonts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def _rls(name: str, grants: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {name} "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute(f"GRANT {grants} ON {name} TO nexus_app")


def upgrade() -> None:
    op.create_table(
        "text_overrides",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("scope_kind", sa.String(16), nullable=False),
        sa.Column("scope_target_id", sa.String(ID), nullable=True),
        sa.Column("locale", sa.String(35), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("message", sa.String(5000), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(ID), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "scope_kind", "scope_target_id", "locale", "key", name="one_per_scope_key"),
        sa.CheckConstraint("scope_kind IN ('platform', 'group', 'institution', 'campus')", name="scope_known"),
        sa.CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'platform')", name="target_unless_platform"),
        sa.CheckConstraint("version >= 1", name="version_positive"),
    )
    _rls("text_overrides", "SELECT, INSERT, UPDATE")

    op.create_table(
        "text_override_revisions",
        sa.Column("override_id", sa.String(ID), sa.ForeignKey("text_overrides.id"), primary_key=True),
        sa.Column("version", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("message", sa.String(5000), nullable=True),
        sa.Column("changed_by", sa.String(ID), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version >= 1", name="version_positive"),
    )
    # History is append-only for the app.
    _rls("text_override_revisions", "SELECT, INSERT")


def downgrade() -> None:
    op.drop_table("text_override_revisions")
    op.drop_table("text_overrides")
