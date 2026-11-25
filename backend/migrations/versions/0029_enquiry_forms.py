"""Public enquiry forms (M12, NEX-204, D79, D81).

One public form per institution, reached by an unguessable `pef-` id. `nexus_public_enquiry_form(form_id)`
(SECURITY DEFINER, owner-owned) maps a form id to its tenant and institution ids only, so the public endpoint
can open that tenant's RLS transaction without any cross-tenant read access.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from nexus.core.ids import new_id

revision: str = "0029_enquiry_forms"
down_revision: str | None = "0028_admissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128


def form_id() -> str:
    """`pef-` + ULID (80 bits from `secrets`): never `random()` or `md5`."""
    return new_id("pef").replace("_", "-", 1)


def upgrade() -> None:
    op.create_table(
        "enquiry_forms",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.UniqueConstraint("institution_id", name="uq_enquiry_forms_institution"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_enquiry_forms_ref_tenant"),
        sa.CheckConstraint("id ~ '^pef-[0-9A-Za-z]{12,64}$'", name="id_valid"),
    )
    # Backfill one form per existing institution. `institutions` forces RLS even for its owner, so lift the
    # force for this transaction only (other sessions wait on the table lock) and restore it straight after.
    conn = op.get_bind()
    op.execute("ALTER TABLE institutions NO FORCE ROW LEVEL SECURITY")
    rows = conn.execute(sa.text("SELECT id, tenant_id FROM institutions ORDER BY tenant_id, id")).all()
    op.execute("ALTER TABLE institutions FORCE ROW LEVEL SECURITY")
    forms = sa.table(
        "enquiry_forms",
        sa.column("id", sa.String),
        sa.column("tenant_id", sa.String),
        sa.column("institution_id", sa.String),
    )
    if rows:
        conn.execute(
            forms.insert(), [{"id": form_id(), "tenant_id": row.tenant_id, "institution_id": row.id} for row in rows]
        )

    op.execute("ALTER TABLE enquiry_forms ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE enquiry_forms FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON enquiry_forms "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute("REVOKE ALL ON enquiry_forms FROM nexus_app")
    op.execute("GRANT SELECT ON enquiry_forms TO nexus_app")

    # Owner-owned definer, like `nexus_outbox_tenants()` (0013): it runs as the migration owner and returns
    # only the two ids of one form, never form or tenant data, so `nexus_app` needs no cross-tenant read.
    op.execute(
        """
        CREATE FUNCTION nexus_public_enquiry_form(form_id varchar)
        RETURNS TABLE (tenant_id varchar, institution_id varchar)
        LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
          SELECT f.tenant_id, f.institution_id FROM enquiry_forms f WHERE f.id = form_id
        $$
        """
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_public_enquiry_form(varchar) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_public_enquiry_form(varchar) TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION nexus_public_enquiry_form(varchar)")
    op.drop_table("enquiry_forms")
