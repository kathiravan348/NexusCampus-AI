"""Theme layers and the font library (NEX-053, M03, C-1, D28/D29).

`themes`: one layer per tenant + scope (platform → group → institution → campus), partial token overrides as
JSON, `locked_tokens` set by a group. `fonts`: the self-hosted library (`tenant_id` NULL, visible to every tenant)
and, from Stage 3, a tenant's uploads.

Revision ID: 0010_themes_fonts
Revises: 0009_privacy
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_themes_fonts"
down_revision: str | None = "0009_privacy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
EMPTY = sa.text("'{}'::jsonb")


def upgrade() -> None:
    op.create_table(
        "themes",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("scope_kind", sa.String(16), nullable=False),
        sa.Column("scope_target_id", sa.String(ID), nullable=True),
        sa.Column("light", postgresql.JSONB(), nullable=False, server_default=EMPTY),
        sa.Column("dark", postgresql.JSONB(), nullable=False, server_default=EMPTY),
        sa.Column("fonts", postgresql.JSONB(), nullable=False),
        sa.Column("radius", postgresql.JSONB(), nullable=False, server_default=EMPTY),
        sa.Column("density", sa.String(16), nullable=True),
        sa.Column("assets", postgresql.JSONB(), nullable=False),
        sa.Column("locked_tokens", postgresql.ARRAY(sa.String(64)), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(ID), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "scope_kind", "scope_target_id", name="one_layer_per_scope"),
        sa.CheckConstraint("scope_kind IN ('platform', 'group', 'institution', 'campus')", name="scope_known"),
        sa.CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'platform')", name="target_unless_platform"),
        sa.CheckConstraint(
            "density IS NULL OR density IN ('compact', 'comfortable', 'spacious')", name="density_known"
        ),
        sa.CheckConstraint("version >= 1", name="version_positive"),
    )
    op.execute("ALTER TABLE themes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE themes FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON themes "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON themes TO nexus_app")

    op.create_table(
        "fonts",
        sa.Column("id", sa.String(ID), primary_key=True),
        #: NULL = the shared library; set = a tenant's upload (Stage 3).
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=True, index=True),
        sa.Column("family", sa.String(100), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("roles", postgresql.ARRAY(sa.String(8)), nullable=False),
        sa.Column("scripts", postgresql.ARRAY(sa.String(16)), nullable=False),
        sa.Column("file_url", sa.String(2048), nullable=True),
        sa.CheckConstraint("source IN ('library', 'upload')", name="source_known"),
        sa.CheckConstraint("(file_url IS NOT NULL) = (source = 'upload')", name="file_only_for_uploads"),
        sa.CheckConstraint("(tenant_id IS NULL) = (source = 'library')", name="library_is_shared"),
        sa.CheckConstraint("cardinality(roles) >= 1 AND cardinality(scripts) >= 1", name="roles_and_scripts"),
    )
    op.execute("ALTER TABLE fonts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE fonts FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON fonts "
        "USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("GRANT SELECT ON fonts TO nexus_app")


def downgrade() -> None:
    op.drop_table("fonts")
    op.drop_table("themes")
