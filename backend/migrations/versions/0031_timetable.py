"""Timetable: rooms, bell schedules and timetable slots (M16, NEX-187). Teacher load is computed, not stored."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0031_timetable"
down_revision: str | None = "0030_import_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("rooms", "bell_schedules", "timetable_slots")
CODE = "code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'"
TIME = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'"


def _base(name: str, *columns: sa.Column[object] | sa.Constraint) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        # The mock appends records: keep that order across pages.
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        *columns,
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("id", "tenant_id", name=f"uq_{name}_ref_tenant"),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )


def upgrade() -> None:
    op.create_index("uq_m16_subject_offering_ref", "subject_offerings", ["id", "tenant_id"], unique=True)
    _base(
        "rooms",
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("campus_id", sa.String(ID), nullable=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        sa.CheckConstraint(CODE, name="code_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("kind IN ('classroom','lab','hall','library','sports','online','other')", name="kind_valid"),
        sa.CheckConstraint("capacity BETWEEN 1 AND 5000", name="capacity_valid"),
    )
    _base(
        "bell_schedules",
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("periods", JSONB(), nullable=False),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint(
            "jsonb_typeof(periods) = 'array' AND jsonb_array_length(periods) BETWEEN 1 AND 20", name="periods_valid"
        ),
    )
    _base(
        "timetable_slots",
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("period_id", sa.String(ID), nullable=True),
        sa.Column("subject_offering_id", sa.String(ID), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("start", sa.String(5), nullable=False),
        sa.Column("end", sa.String(5), nullable=False),
        sa.Column("room_id", sa.String(ID), nullable=True),
        sa.Column("staff_profile_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        sa.ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        sa.ForeignKeyConstraint(["room_id", "tenant_id"], ["rooms.id", "rooms.tenant_id"]),
        sa.CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday_valid"),
        sa.CheckConstraint(f'start ~ {TIME} AND "end" ~ {TIME} AND "end" > start', name="times_valid"),
        sa.CheckConstraint("m15_staff_ids_valid(staff_profile_ids)", name="staff_ids_valid"),
        sa.CheckConstraint("effective_to >= effective_from", name="effective_dates_valid"),
    )
    op.create_index("ix_timetable_slots_week", "timetable_slots", ["tenant_id", "weekday"])
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
    op.execute("GRANT INSERT ON timetable_slots TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.drop_index("uq_m16_subject_offering_ref", table_name="subject_offerings")
