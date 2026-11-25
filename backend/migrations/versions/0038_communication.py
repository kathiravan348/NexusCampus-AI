"""Communication (M24, NEX-191): message threads and messages, notices, meeting slots and bookings.

Message bodies and booking notes are personal data: FieldCipher text under the tenant's `tenant_data` key. The app
role may insert messages and update only a thread's last-message and update times.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0038_communication"
down_revision: str | None = "0037_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("message_threads", "thread_messages", "notices", "meeting_slots", "meeting_bookings")
CIPHER = "'^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'"
TIME = "'^([01][0-9]|2[0-3]):[0-5][0-9]$'"


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


def _institution() -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"])


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION m24_ids_valid(ids varchar[], max_count int) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
          SELECT cardinality(ids) <= max_count AND coalesce(array_ndims(ids), 1) = 1
            AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) AS item(id) WHERE length(id) > 0)
        $$
        """
    )
    op.create_table(
        "message_threads",
        *_ids(
            sa.Column("institution_id", sa.String(ID), nullable=False),
            sa.Column("kind", sa.String(16), nullable=False),
            sa.Column("subject", sa.String(160), nullable=False),
            sa.Column("participant_person_ids", ARRAY(sa.String(ID)), nullable=False),
            sa.Column("class_group_id", sa.String(ID), nullable=True),
            sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived", sa.Boolean(), nullable=False),
            *_stamps(),
        ),
        _institution(),
        sa.ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        _ref("message_threads"),
        sa.CheckConstraint("kind IN ('direct','class_group','staff_group','broadcast')", name="kind_valid"),
        sa.CheckConstraint("length(btrim(subject)) > 0", name="subject_present"),
        sa.CheckConstraint(
            "m24_ids_valid(participant_person_ids, 500) AND cardinality(participant_person_ids) >= "
            "CASE WHEN kind = 'broadcast' THEN 1 ELSE 2 END",
            name="participants_valid",
        ),
        sa.CheckConstraint("(class_group_id IS NOT NULL) = (kind = 'class_group')", name="class_group_iff_kind"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index(
        "ix_message_threads_participants", "message_threads", ["participant_person_ids"], postgresql_using="gin"
    )
    op.create_table(
        "thread_messages",
        *_ids(
            sa.Column("thread_id", sa.String(ID), nullable=False),
            sa.Column("sender_person_id", sa.String(ID), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("attachment_ids", ARRAY(sa.String(ID)), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("read_by_person_ids", ARRAY(sa.String(ID)), nullable=False),
            sa.Column("device_id", sa.String(ID), nullable=True),
        ),
        sa.ForeignKeyConstraint(["thread_id", "tenant_id"], ["message_threads.id", "message_threads.tenant_id"]),
        sa.ForeignKeyConstraint(["sender_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.Index("ix_thread_messages_thread", "tenant_id", "thread_id", "list_order"),
        sa.CheckConstraint(f"body ~ {CIPHER}", name="body_encrypted"),
        sa.CheckConstraint("m24_ids_valid(attachment_ids, 10)", name="attachments_valid"),
        sa.CheckConstraint("m24_ids_valid(read_by_person_ids, 500)", name="readers_valid"),
        sa.CheckConstraint("edited_at >= sent_at", name="edited_after_sent"),
    )
    op.create_table(
        "notices",
        *_ids(
            sa.Column("institution_id", sa.String(ID), nullable=False),
            sa.Column("title", sa.String(160), nullable=False),
            sa.Column("body", sa.String(8000), nullable=False),
            sa.Column("audience", JSONB(), nullable=False),
            sa.Column("channels", ARRAY(sa.String(16)), nullable=False),
            sa.Column("requires_acknowledgement", sa.Boolean(), nullable=False),
            sa.Column("publish_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("created_by_staff_profile_id", sa.String(ID), nullable=False),
            *_stamps(),
        ),
        _institution(),
        sa.ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
        sa.CheckConstraint("length(btrim(title)) > 0 AND length(btrim(body)) > 0", name="text_present"),
        sa.CheckConstraint("jsonb_typeof(audience) = 'object'", name="audience_valid"),
        sa.CheckConstraint(
            "cardinality(channels) BETWEEN 1 AND 5 AND m24_ids_valid(channels, 5) AND "
            "channels <@ ARRAY['email','sms','whatsapp','push','in_app']::varchar[]",
            name="channels_valid",
        ),
        sa.CheckConstraint("expires_at > publish_at", name="expires_after_publish"),
        sa.CheckConstraint("status IN ('draft','scheduled','published','withdrawn')", name="status_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "meeting_slots",
        *_ids(
            sa.Column("staff_profile_id", sa.String(ID), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("start", sa.String(5), nullable=False),
            sa.Column("end", sa.String(5), nullable=False),
            sa.Column("mode", sa.String(16), nullable=False),
            sa.Column("location", sa.String(120), nullable=True),
            sa.Column("capacity", sa.Integer(), nullable=False),
        ),
        sa.ForeignKeyConstraint(["staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]),
        _ref("meeting_slots"),
        sa.CheckConstraint(f'start ~ {TIME} AND "end" ~ {TIME} AND "end" > start', name="times_valid"),
        sa.CheckConstraint("mode IN ('in_person','video','phone')", name="mode_valid"),
        sa.CheckConstraint("capacity BETWEEN 1 AND 10", name="capacity_valid"),
    )
    op.create_table(
        "meeting_bookings",
        *_ids(
            sa.Column("slot_id", sa.String(ID), nullable=False),
            sa.Column("guardian_person_id", sa.String(ID), nullable=False),
            sa.Column("learner_id", sa.String(ID), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            *_stamps(),
        ),
        sa.ForeignKeyConstraint(["slot_id", "tenant_id"], ["meeting_slots.id", "meeting_slots.tenant_id"]),
        sa.ForeignKeyConstraint(["guardian_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.CheckConstraint("status IN ('booked','cancelled','attended','no_show')", name="status_valid"),
        sa.CheckConstraint(f"note ~ {CIPHER}", name="note_encrypted"),
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
    op.execute("GRANT INSERT ON thread_messages TO nexus_app")
    op.execute("GRANT UPDATE (last_message_at, updated_at) ON message_threads TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m24_ids_valid(varchar[], int)")
