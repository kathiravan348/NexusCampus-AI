"""Gradebook (M20, NEX-189): grading schemes, assessments, rubrics and mark entries.

A mark entry is one row per assessment and learner (upserted). Remarks are personal data: FieldCipher text under the
tenant's `tenant_data` key. The app role may insert mark entries and update only their entry columns.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0035_gradebook"
down_revision: str | None = "0034_accounting"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("grading_schemes", "rubrics", "assessments", "mark_entries")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"
ENTRY_COLUMNS = "marks, absent, rubric_scores, remark, entered_by_staff_profile_id, entered_at, device_id"


def _ids() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
    ]


def _stamps() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def _json_array(column: str, low: int, high: int) -> sa.CheckConstraint:
    return sa.CheckConstraint(
        f"jsonb_typeof({column}) = 'array' AND jsonb_array_length({column}) BETWEEN {low} AND {high}",
        name=f"{column}_valid",
    )


def upgrade() -> None:
    op.create_table(
        "grading_schemes",
        *_ids(),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("bands", JSONB(), nullable=False),
        *_stamps(),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("kind IN ('percent','letter','gpa','descriptor','competency')", name="kind_valid"),
        _json_array("bands", 1, 20),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "rubrics",
        *_ids(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("criteria", JSONB(), nullable=False),
        sa.UniqueConstraint("id", "tenant_id", name="uq_rubrics_ref_tenant"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        _json_array("criteria", 1, 20),
    )
    op.create_table(
        "assessments",
        *_ids(),
        sa.Column("subject_offering_id", sa.String(ID), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("max_marks", sa.Numeric(7, 1), nullable=False),
        sa.Column("weight_percent", sa.Numeric(), nullable=False),
        sa.Column("rubric_id", sa.String(ID), nullable=True),
        sa.Column("due_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        *_stamps(),
        sa.ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        sa.ForeignKeyConstraint(["rubric_id", "tenant_id"], ["rubrics.id", "rubrics.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", name="uq_assessments_ref_tenant"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint(
            "kind IN ('test','assignment','project','practical','oral','observation')", name="kind_valid"
        ),
        sa.CheckConstraint(
            "max_marks BETWEEN 1 AND 1000 AND max_marks * 2 = trunc(max_marks * 2)", name="max_marks_valid"
        ),
        sa.CheckConstraint("weight_percent BETWEEN 0 AND 100", name="weight_valid"),
        sa.CheckConstraint("status IN ('draft','open','marking','moderated','published')", name="status_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "mark_entries",
        *_ids(),
        sa.Column("assessment_id", sa.String(ID), nullable=False),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("marks", sa.Numeric(7, 1), nullable=True),
        sa.Column("absent", sa.Boolean(), nullable=False),
        sa.Column("rubric_scores", JSONB(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("entered_by_staff_profile_id", sa.String(ID), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("device_id", sa.String(ID), nullable=True),
        sa.ForeignKeyConstraint(["assessment_id", "tenant_id"], ["assessments.id", "assessments.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["entered_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.UniqueConstraint("tenant_id", "assessment_id", "learner_id", name="uq_mark_entries_learner"),
        sa.CheckConstraint("marks >= 0 AND marks * 2 = trunc(marks * 2)", name="marks_valid"),
        sa.CheckConstraint("NOT absent OR marks IS NULL", name="absent_has_no_marks"),
        sa.CheckConstraint("jsonb_typeof(rubric_scores) = 'object'", name="rubric_scores_valid"),
        sa.CheckConstraint(f"remark ~ {CIPHER}", name="remark_encrypted"),
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
    op.execute("GRANT INSERT ON mark_entries TO nexus_app")
    op.execute(f"GRANT UPDATE ({ENTRY_COLUMNS}) ON mark_entries TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
