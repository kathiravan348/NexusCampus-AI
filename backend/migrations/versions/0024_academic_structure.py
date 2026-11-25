"""M15 academic structure with tenant-bound references and forced RLS (NEX-183)."""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "0024_academic_structure"
down_revision: str | None = "0023_stage3_access"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
INDEXED_PARENTS = ("campuses", "academic_calendars", "role_profiles")
TABLES = ("programs", "year_levels", "class_groups", "subjects", "subject_offerings")


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True)


def _timestamps() -> tuple[sa.Column[datetime], sa.Column[datetime]]:
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def upgrade() -> None:
    # Institutions already have a unique (id, tenant_id) constraint.
    for parent in INDEXED_PARENTS:
        op.create_index(f"uq_m15_{parent}_ref", parent, ["id", "tenant_id"], unique=True)

    op.execute(
        """
        CREATE FUNCTION m15_staff_ids_valid(ids varchar[]) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT cardinality(ids) <= 10 AND coalesce(array_ndims(ids), 1) = 1
            AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) AS staff(id) WHERE length(id) > 0)
        $$
        """
    )
    op.create_table(
        "programs",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("duration_years", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", "institution_id", name="uq_programs_ref_tenant_institution"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_programs_ref_tenant"),
        sa.CheckConstraint(
            "kind IN ('early_years', 'school_stage', 'degree', 'diploma', 'certificate', 'course', 'batch_program')",
            name="kind_valid",
        ),
        sa.CheckConstraint("duration_years BETWEEN 1 AND 10", name="duration_years_valid"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index("uq_programs_code", "programs", ["institution_id", sa.text("lower(code)")], unique=True)

    op.create_table(
        "year_levels",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("program_id", sa.String(ID), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", "program_id", name="uq_year_levels_ref_tenant_program"),
        sa.UniqueConstraint("program_id", "order", name="uq_year_levels_program_order"),
        sa.CheckConstraint('"order" >= 1', name="order_positive"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
    )
    op.create_index("uq_year_levels_code", "year_levels", ["program_id", sa.text("lower(code)")], unique=True)

    op.create_table(
        "class_groups",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("campus_id", sa.String(ID), nullable=True),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("program_id", sa.String(ID), nullable=False),
        sa.Column("year_level_id", sa.String(ID), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("homeroom_staff_profile_id", sa.String(ID), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        sa.ForeignKeyConstraint(
            ["program_id", "tenant_id", "institution_id"],
            ["programs.id", "programs.tenant_id", "programs.institution_id"],
        ),
        sa.ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        sa.ForeignKeyConstraint(
            ["homeroom_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        sa.UniqueConstraint("id", "tenant_id", "academic_year_id", name="uq_class_groups_ref_tenant_academic_year"),
        sa.CheckConstraint("kind IN ('section', 'batch', 'cohort', 'group')", name="kind_valid"),
        sa.CheckConstraint("capacity BETWEEN 1 AND 2000", name="capacity_valid"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index("uq_class_groups_code", "class_groups", ["academic_year_id", sa.text("lower(code)")], unique=True)

    op.create_table(
        "subjects",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("credits", sa.Numeric(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", name="uq_subjects_ref_tenant"),
        sa.CheckConstraint("kind IN ('core', 'elective', 'language', 'activity', 'lab', 'project')", name="kind_valid"),
        sa.CheckConstraint("credits BETWEEN 0 AND 60 AND credits * 2 = trunc(credits * 2)", name="credits_valid"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index("uq_subjects_code", "subjects", ["institution_id", sa.text("lower(code)")], unique=True)

    op.create_table(
        "subject_offerings",
        sa.Column("id", sa.String(ID), primary_key=True),
        _tenant(),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("period_id", sa.String(ID), nullable=True),
        sa.Column("class_group_id", sa.String(ID), nullable=False),
        sa.Column("subject_id", sa.String(ID), nullable=False),
        sa.Column("staff_profile_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("weekly_periods", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        sa.ForeignKeyConstraint(
            ["class_group_id", "tenant_id", "academic_year_id"],
            ["class_groups.id", "class_groups.tenant_id", "class_groups.academic_year_id"],
        ),
        sa.ForeignKeyConstraint(["subject_id", "tenant_id"], ["subjects.id", "subjects.tenant_id"]),
        sa.CheckConstraint("weekly_periods BETWEEN 0 AND 60", name="weekly_periods_valid"),
        sa.CheckConstraint("m15_staff_ids_valid(staff_profile_ids)", name="staff_ids_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")
    op.execute("GRANT INSERT ON class_groups TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m15_staff_ids_valid(varchar[])")
    for parent in reversed(INDEXED_PARENTS):
        op.drop_index(f"uq_m15_{parent}_ref", table_name=parent)
