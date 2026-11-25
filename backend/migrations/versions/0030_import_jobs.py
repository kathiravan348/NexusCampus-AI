"""Import jobs, column mappings and row issues (M09, NEX-203). No file parsing or importing yet."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0030_import_jobs"
down_revision: str | None = "0029_enquiry_forms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("import_jobs", "column_mappings", "import_row_issues")
ENTITIES = "('learner','guardian','staff','enrolment','fee_balance','mark')"
STATUSES = "('uploaded','mapped','dry_run_ready','importing','completed','failed','rolled_back')"
# The frozen contract: 1-200 characters, not blank, `.` or `..` after trimming, no `/ : \`, no control characters.
FILE_NAME = (
    "char_length(file_name) BETWEEN 1 AND 200 "
    "AND btrim(file_name, E' \\t\\n\\r\\f\\v') NOT IN ('', '.', '..') "
    "AND file_name !~ '[/:\\\\]' AND file_name !~ '[\\x01-\\x1f]'"
)
MESSAGE_KEY = "message_key ~ '^(common|term|[mp][0-9]{2})[.][a-z][A-Za-z0-9]*([.][a-z][A-Za-z0-9]*)*$'"


def upgrade() -> None:
    op.create_table(
        "import_jobs",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("entity", sa.String(16), nullable=False),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("source_format", sa.String(8), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("valid_rows", sa.Integer(), nullable=False),
        sa.Column("error_rows", sa.Integer(), nullable=False),
        sa.Column("created_by_staff_profile_id", sa.String(ID), nullable=False),
        sa.Column("rollback_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.UniqueConstraint("id", "tenant_id", name="uq_import_jobs_ref_tenant"),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.CheckConstraint(f"entity IN {ENTITIES}", name="entity_valid"),
        sa.CheckConstraint("source_format IN ('csv','xlsx')", name="source_format_valid"),
        sa.CheckConstraint(f"status IN {STATUSES}", name="status_valid"),
        sa.CheckConstraint(FILE_NAME, name="file_name_plain"),
        sa.CheckConstraint("template_version >= 1", name="template_version_valid"),
        sa.CheckConstraint(
            "total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0 AND valid_rows + error_rows <= total_rows",
            name="row_counts_valid",
        ),
        sa.CheckConstraint("(rollback_until IS NOT NULL) = (status = 'completed')", name="rollback_until_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "column_mappings",
        sa.Column("job_id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("columns", JSONB(), nullable=False),
        sa.ForeignKeyConstraint(["job_id", "tenant_id"], ["import_jobs.id", "import_jobs.tenant_id"]),
        sa.CheckConstraint(
            "jsonb_typeof(columns) = 'array' AND jsonb_array_length(columns) BETWEEN 1 AND 200",
            name="columns_valid",
        ),
    )
    op.create_table(
        "import_row_issues",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("job_id", sa.String(ID), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("column", sa.String(120), nullable=True),
        sa.Column("severity", sa.String(8), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("message_key", sa.String(200), nullable=False),
        sa.ForeignKeyConstraint(["job_id", "tenant_id"], ["import_jobs.id", "import_jobs.tenant_id"]),
        sa.Index("ix_import_row_issues_job", "job_id", "row_number", "id"),
        sa.CheckConstraint("row_number >= 1", name="row_number_valid"),
        sa.CheckConstraint('char_length("column") BETWEEN 1 AND 120', name="column_valid"),
        sa.CheckConstraint("severity IN ('error','warning')", name="severity_valid"),
        sa.CheckConstraint("code ~ '^[a-z_]{3,40}$'", name="code_valid"),
        sa.CheckConstraint(MESSAGE_KEY, name="message_key_valid"),
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
    op.execute("GRANT INSERT ON import_jobs TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
