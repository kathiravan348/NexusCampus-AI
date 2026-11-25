"""Exams (M21, NEX-207): exams, papers, seat assignments, hall tickets and revaluation requests.

A new seat plan replaces the paper's seats, so the app role may insert and delete seat assignments (nothing else).
Revaluation reasons are personal data: FieldCipher text under the tenant's `tenant_data` key.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "0036_exams"
down_revision: str | None = "0035_gradebook"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("exams", "exam_papers", "seat_assignments", "hall_tickets", "revaluation_requests")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"
TIME = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'"
HALVES = "{0} * 2 = trunc({0} * 2)"


def _ids(*columns: sa.Column[object]) -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        *columns,
    ]


def _stamps() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def _ref(name: str) -> sa.UniqueConstraint:
    return sa.UniqueConstraint("id", "tenant_id", name=f"uq_{name}_ref_tenant")


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION m21_room_ids_valid(ids varchar[]) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT cardinality(ids) <= 20 AND coalesce(array_ndims(ids), 1) = 1
            AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) AS room(id) WHERE length(id) > 0)
        $$
        """
    )
    op.create_table(
        "exams",
        *_ids(
            sa.Column("institution_id", sa.String(ID), nullable=False),
            sa.Column("academic_year_id", sa.String(ID), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            *_stamps(),
        ),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"], ["academic_calendars.id", "academic_calendars.tenant_id"]
        ),
        _ref("exams"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint("ends_on >= starts_on", name="dates_valid"),
        sa.CheckConstraint(
            "status IN ('planned','scheduled','running','results_pending','published')", name="status_valid"
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "exam_papers",
        *_ids(
            sa.Column("exam_id", sa.String(ID), nullable=False),
            sa.Column("subject_offering_id", sa.String(ID), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("start", sa.String(5), nullable=False),
            sa.Column("end", sa.String(5), nullable=False),
            sa.Column("room_ids", ARRAY(sa.String(ID)), nullable=False),
            sa.Column("max_marks", sa.Numeric(7, 1), nullable=False),
        ),
        sa.ForeignKeyConstraint(["exam_id", "tenant_id"], ["exams.id", "exams.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["subject_offering_id", "tenant_id"], ["subject_offerings.id", "subject_offerings.tenant_id"]
        ),
        _ref("exam_papers"),
        sa.CheckConstraint(f'start ~ {TIME} AND "end" ~ {TIME} AND "end" > start', name="times_valid"),
        sa.CheckConstraint("m21_room_ids_valid(room_ids)", name="room_ids_valid"),
        sa.CheckConstraint("max_marks BETWEEN 1 AND 1000 AND " + HALVES.format("max_marks"), name="max_marks_valid"),
    )
    op.create_table(
        "seat_assignments",
        *_ids(
            sa.Column("exam_paper_id", sa.String(ID), nullable=False),
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("room_id", sa.String(ID), nullable=False),
            sa.Column("seat_label", sa.String(10), nullable=False),
        ),
        sa.ForeignKeyConstraint(["exam_paper_id", "tenant_id"], ["exam_papers.id", "exam_papers.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(["room_id", "tenant_id"], ["rooms.id", "rooms.tenant_id"]),
        sa.UniqueConstraint("tenant_id", "exam_paper_id", "learner_id", name="uq_seat_assignments_learner"),
        sa.UniqueConstraint("tenant_id", "exam_paper_id", "room_id", "seat_label", name="uq_seat_assignments_seat"),
        sa.CheckConstraint("length(btrim(seat_label)) > 0", name="label_present"),
    )
    op.create_table(
        "hall_tickets",
        *_ids(
            sa.Column("exam_id", sa.String(ID), nullable=False),
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("ticket_number", sa.String(40), nullable=False),
            sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked", sa.Boolean(), nullable=False),
        ),
        sa.ForeignKeyConstraint(["exam_id", "tenant_id"], ["exams.id", "exams.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.UniqueConstraint("tenant_id", "ticket_number", name="uq_hall_tickets_number"),
        sa.CheckConstraint("length(btrim(ticket_number)) > 0", name="number_present"),
    )
    op.create_table(
        "revaluation_requests",
        *_ids(
            sa.Column("exam_paper_id", sa.String(ID), nullable=False),
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("old_marks", sa.Numeric(7, 1), nullable=False),
            sa.Column("new_marks", sa.Numeric(7, 1), nullable=True),
            *_stamps(),
        ),
        sa.ForeignKeyConstraint(["exam_paper_id", "tenant_id"], ["exam_papers.id", "exam_papers.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.CheckConstraint(f"reason ~ {CIPHER}", name="reason_encrypted"),
        sa.CheckConstraint("status IN ('requested','in_review','changed','unchanged','rejected')", name="status_valid"),
        sa.CheckConstraint(
            "old_marks >= 0 AND "
            + HALVES.format("old_marks")
            + " AND new_marks >= 0 AND "
            + HALVES.format("new_marks"),
            name="marks_valid",
        ),
        sa.CheckConstraint("(new_marks IS NOT NULL) = (status = 'changed')", name="new_marks_iff_changed"),
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
        op.execute(f"REVOKE ALL ON {table} FROM nexus_app")
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")
    op.execute("GRANT INSERT, DELETE ON seat_assignments TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m21_room_ids_valid(varchar[])")
