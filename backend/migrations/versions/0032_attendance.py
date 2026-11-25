"""Attendance sessions, marks and leave requests (M17, NEX-205).

Marks are append-only (`nexus_app` may insert, never update or delete). Mark notes and leave reasons are personal
data: FieldCipher text under the tenant's `tenant_data` key, never plaintext (CHECK) and never logged.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032_attendance"
down_revision: str | None = "0031_timetable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("attendance_sessions", "attendance_marks", "leave_requests")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"


def _common() -> list[sa.Column[object]]:
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


def upgrade() -> None:
    op.create_table(
        "attendance_sessions",
        *_common(),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("class_group_id", sa.String(ID), nullable=True),
        sa.Column("timetable_slot_id", sa.String(ID), nullable=True),
        sa.Column("event_label", sa.String(120), nullable=True),
        sa.Column("taken_by_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["timetable_slot_id", "tenant_id"], ["timetable_slots.id", "timetable_slots.tenant_id"]
        ),
        sa.ForeignKeyConstraint(
            ["taken_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.UniqueConstraint("id", "tenant_id", name="uq_attendance_sessions_ref_tenant"),
        sa.CheckConstraint("mode IN ('daily','period','session','event')", name="mode_valid"),
        sa.CheckConstraint("status IN ('open','submitted','locked')", name="status_valid"),
        sa.CheckConstraint("(timetable_slot_id IS NOT NULL) = (mode = 'period')", name="slot_iff_period"),
        sa.CheckConstraint("(event_label IS NOT NULL) = (mode = 'event')", name="label_iff_event"),
        sa.CheckConstraint("length(btrim(event_label)) > 0", name="label_present"),
        sa.CheckConstraint("(submitted_at IS NOT NULL) = (status <> 'open')", name="submitted_iff_closed"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "attendance_marks",
        *_common(),
        sa.Column("session_id", sa.String(ID), nullable=False),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("minutes_late", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("method", sa.String(16), nullable=False),
        sa.Column("marked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("marked_by_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("device_id", sa.String(ID), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id", "tenant_id"], ["attendance_sessions.id", "attendance_sessions.tenant_id"]
        ),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["marked_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.Index("ix_attendance_marks_session", "tenant_id", "session_id", "list_order"),
        sa.CheckConstraint("status IN ('present','absent','late','excused','on_leave','remote')", name="status_valid"),
        sa.CheckConstraint("method IN ('manual','qr','nfc','biometric','geo','online_join')", name="method_valid"),
        sa.CheckConstraint("(minutes_late IS NOT NULL) = (status = 'late')", name="late_iff_minutes"),
        sa.CheckConstraint("minutes_late BETWEEN 1 AND 600", name="minutes_late_valid"),
        sa.CheckConstraint(f"note ~ {CIPHER}", name="note_encrypted"),
    )
    op.create_table(
        "leave_requests",
        *_common(),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("requested_by_person_id", sa.String(ID), nullable=False),
        sa.Column("from", sa.Date(), nullable=False),
        sa.Column("to", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("decided_by_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(["requested_by_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["decided_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.CheckConstraint("status IN ('pending','approved','rejected','cancelled')", name="status_valid"),
        sa.CheckConstraint('"to" >= "from"', name="dates_valid"),
        sa.CheckConstraint(
            "(decided_by_staff_profile_id IS NOT NULL) = (status IN ('approved','rejected'))",
            name="decider_iff_decided",
        ),
        sa.CheckConstraint(
            "(decided_at IS NOT NULL) = (status IN ('approved','rejected'))", name="decided_iff_decided"
        ),
        sa.CheckConstraint(f"reason ~ {CIPHER}", name="reason_encrypted"),
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
    op.execute("GRANT INSERT ON attendance_marks TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
