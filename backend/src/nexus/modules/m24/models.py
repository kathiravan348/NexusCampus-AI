"""SQLAlchemy mappings for the M24 communication tables in revision 0038."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base


class CommunicationRow:
    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


def _now() -> Any:
    return mapped_column(DateTime(timezone=True), server_default=text("now()"))


class MessageThread(CommunicationRow, Base):
    __tablename__ = "message_threads"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_message_threads_ref_tenant"),
        Index("ix_message_threads_participants", "participant_person_ids", postgresql_using="gin"),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(160))
    participant_person_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    class_group_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived: Mapped[bool] = mapped_column(Boolean())
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class ThreadMessage(CommunicationRow, Base):
    __tablename__ = "thread_messages"
    __table_args__ = (
        ForeignKeyConstraint(["thread_id", "tenant_id"], ["message_threads.id", "message_threads.tenant_id"]),
        ForeignKeyConstraint(["sender_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        Index("ix_thread_messages_thread", "tenant_id", "thread_id", "list_order"),
    )

    thread_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    sender_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    body: Mapped[str] = mapped_column(Text())
    attachment_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    sent_at: Mapped[datetime] = _now()
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    read_by_person_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    device_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class Notice(CommunicationRow, Base):
    __tablename__ = "notices"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(
            ["created_by_staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]
        ),
    )

    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(String(8000))
    audience: Mapped[dict[str, Any]] = mapped_column(JSONB())
    channels: Mapped[list[str]] = mapped_column(ARRAY(String(16)))
    requires_acknowledgement: Mapped[bool] = mapped_column(Boolean())
    publish_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16))
    created_by_staff_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()


class MeetingSlot(CommunicationRow, Base):
    __tablename__ = "meeting_slots"
    __table_args__ = (
        ForeignKeyConstraint(["staff_profile_id", "tenant_id"], ["role_profiles.id", "role_profiles.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_meeting_slots_ref_tenant"),
    )

    staff_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    date: Mapped[date] = mapped_column(Date())
    start: Mapped[str] = mapped_column(String(5))
    end: Mapped[str] = mapped_column(String(5))
    mode: Mapped[str] = mapped_column(String(16))
    location: Mapped[str | None] = mapped_column(String(120))
    capacity: Mapped[int] = mapped_column(Integer())


class MeetingBooking(CommunicationRow, Base):
    __tablename__ = "meeting_bookings"
    __table_args__ = (
        ForeignKeyConstraint(["slot_id", "tenant_id"], ["meeting_slots.id", "meeting_slots.tenant_id"]),
        ForeignKeyConstraint(["guardian_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
    )

    slot_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    guardian_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    status: Mapped[str] = mapped_column(String(16))
    note: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()
