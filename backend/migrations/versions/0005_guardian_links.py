"""Guardian links (NEX-048, G-6): which learners a guardian may see unmasked and list as family.

Revision ID: 0005_guardian_links
Revises: 0004_rbac_entitlements
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_guardian_links"
down_revision: str | None = "0004_rbac_entitlements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def upgrade() -> None:
    op.create_table(
        "guardian_links",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("guardian_person_id", sa.String(ID), primary_key=True),
        sa.Column("learner_person_id", sa.String(ID), primary_key=True),
        sa.ForeignKeyConstraint(["guardian_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.CheckConstraint("guardian_person_id <> learner_person_id", name="not_self"),
    )
    op.execute("ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE guardian_links FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON guardian_links "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("GRANT SELECT, INSERT, DELETE ON guardian_links TO nexus_app")


def downgrade() -> None:
    op.drop_table("guardian_links")
