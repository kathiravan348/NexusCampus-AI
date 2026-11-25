"""Report cards (M22) and issued documents (M23), NEX-190.

Remarks and revocation reasons are personal data: FieldCipher text under the tenant's `tenant_data` key. The app role
may change only a report card's status (with its publish time) and a document's revocation.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0037_records"
down_revision: str | None = "0036_exams"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("report_cards", "issued_documents")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"


def _ids() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "report_cards",
        *_ids(),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("period_id", sa.String(ID), nullable=True),
        sa.Column("template_id", sa.String(ID), nullable=False),
        sa.Column("lines", JSONB(), nullable=False),
        sa.Column("line_remarks", sa.Text(), nullable=True),
        sa.Column("overall_remark", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.CheckConstraint(
            "jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 60", name="lines_valid"
        ),
        sa.CheckConstraint(f"line_remarks ~ {CIPHER}", name="line_remarks_encrypted"),
        sa.CheckConstraint(f"overall_remark ~ {CIPHER}", name="overall_remark_encrypted"),
        sa.CheckConstraint("status IN ('draft','approved','published','withdrawn')", name="status_valid"),
        sa.CheckConstraint("(published_at IS NOT NULL) = (status = 'published')", name="published_iff_published"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "issued_documents",
        *_ids(),
        sa.Column("learner_id", sa.String(ID), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("number", sa.String(40), nullable=False),
        sa.Column("template_id", sa.String(ID), nullable=False),
        sa.Column("issued_on", sa.Date(), nullable=False),
        sa.Column("signatures", JSONB(), nullable=False),
        sa.Column("verification_code", sa.String(16), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.UniqueConstraint("verification_code", name="uq_issued_documents_code"),
        sa.CheckConstraint(
            "kind IN ('bonafide','transfer','completion','character','transcript','letter','other')", name="kind_valid"
        ),
        sa.CheckConstraint("length(btrim(number)) > 0", name="number_present"),
        sa.CheckConstraint(
            "jsonb_typeof(signatures) = 'array' AND jsonb_array_length(signatures) <= 5", name="signatures_valid"
        ),
        sa.CheckConstraint("verification_code ~ '^[A-Z0-9]{10,16}$'", name="code_valid"),
        sa.CheckConstraint("revoked = (revoked_reason IS NOT NULL)", name="reason_iff_revoked"),
        sa.CheckConstraint(f"revoked_reason ~ {CIPHER}", name="reason_encrypted"),
    )
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"REVOKE ALL ON {table} FROM nexus_app")
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")
    op.execute("GRANT UPDATE (status, published_at, updated_at) ON report_cards TO nexus_app")
    op.execute("GRANT UPDATE (revoked, revoked_reason) ON issued_documents TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
