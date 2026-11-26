"""Frozen M24 communication wire shapes (`frontend/packages/contracts/src/communication.ts`)."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictBool, StrictInt, StringConstraints, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Record
from nexus.modules.m16.schemas import TimeOfDay

Channel = Literal["email", "sms", "whatsapp", "push", "in_app"]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


def _unique(values: list[str]) -> bool:
    return len(set(values)) == len(values)


class MessageThreadOut(Record):
    institution_id: Id
    kind: Literal["direct", "class_group", "staff_group", "broadcast"]
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    participant_person_ids: Annotated[list[Id], Field(min_length=1, max_length=500)]
    class_group_id: Id | None
    last_message_at: datetime | None
    archived: StrictBool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not _unique(self.participant_person_ids):
            raise ValueError("participantPersonIds has duplicates")
        if self.kind != "broadcast" and len(self.participant_person_ids) < 2:
            raise ValueError("participantPersonIds requires at least 2 participants unless kind is broadcast")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class ThreadMessageOut(Record):
    thread_id: Id
    sender_person_id: Id
    body: Body
    attachment_ids: Annotated[list[Id], Field(max_length=10)]
    sent_at: datetime
    edited_at: datetime | None
    read_by_person_ids: Annotated[list[Id], Field(max_length=500)]
    device_id: Id | None

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not _unique(self.attachment_ids) or not _unique(self.read_by_person_ids):
            raise ValueError("ids have duplicates")
        if self.edited_at is not None and self.edited_at < self.sent_at:
            raise ValueError("editedAt is before sentAt")
        return self


class ThreadMessageIn(Contract):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    body: Body


class NoticeAudience(Contract):
    kind: Literal["everyone", "class_groups", "roles", "people"]
    ids: Annotated[list[Id], Field(max_length=500)]

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not _unique(self.ids):
            raise ValueError("ids has duplicates")
        if (len(self.ids) == 0) != (self.kind == "everyone"):
            raise ValueError("ids must be empty iff audience kind is everyone")
        return self


class NoticeOut(Record):
    institution_id: Id
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    audience: NoticeAudience
    channels: Annotated[list[Channel], Field(min_length=1, max_length=5)]
    requires_acknowledgement: StrictBool
    publish_at: datetime
    expires_at: datetime | None
    status: Literal["draft", "scheduled", "published", "withdrawn"]
    created_by_staff_profile_id: Id
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not _unique(list(self.channels)):
            raise ValueError("channels has duplicates")
        if self.expires_at is not None and self.expires_at <= self.publish_at:
            raise ValueError("expiresAt must be after publishAt")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class MeetingSlotOut(Record):
    staff_profile_id: Id
    date: date
    start: TimeOfDay
    end: TimeOfDay
    mode: Literal["in_person", "video", "phone"]
    location: Annotated[str, Field(max_length=120)] | None
    capacity: Annotated[StrictInt, Field(ge=1, le=10)]

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self


class MeetingBookingOut(Record):
    slot_id: Id
    guardian_person_id: Id
    learner_id: Id
    status: Literal["booked", "cancelled", "attended", "no_show"]
    note: Annotated[str, Field(max_length=300)] | None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self
