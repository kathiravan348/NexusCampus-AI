"""Frozen M17 attendance wire shapes (`frontend/packages/contracts/src/attendance.ts`)."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictInt, StringConstraints, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Record

Status = Literal["present", "absent", "late", "excused", "on_leave", "remote"]
Method = Literal["manual", "qr", "nfc", "biometric", "geo", "online_join"]
MinutesLate = Annotated[StrictInt, Field(ge=1, le=600)]
Note = Annotated[str, Field(max_length=300)]


def _late_rule(status: str, minutes_late: int | None) -> bool:
    return (minutes_late is not None) == (status == "late")


class Timestamped(Record):
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def timestamps_in_order(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class AttendanceSessionOut(Timestamped):
    institution_id: Id
    mode: Literal["daily", "period", "session", "event"]
    date: date
    class_group_id: Id | None
    timetable_slot_id: Id | None
    event_label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None
    taken_by_staff_profile_id: Id | None
    status: Literal["open", "submitted", "locked"]
    submitted_at: datetime | None



class RosterEntryOut(Contract):
    learner_id: Id
    roll_number: Annotated[str, Field(min_length=1, max_length=20)] | None


class AttendanceMarkIn(Contract):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    learner_id: Id
    status: Status
    minutes_late: MinutesLate | None
    note: Note | None

    def rule_path(self) -> str | None:
        return None if _late_rule(self.status, self.minutes_late) else "minutesLate"


class AttendanceMarkOut(Record):
    session_id: Id
    learner_id: Id
    status: Status
    minutes_late: MinutesLate | None
    note: Note | None
    method: Method
    marked_at: datetime
    marked_by_staff_profile_id: Id | None
    device_id: Id | None

    @model_validator(mode="after")
    def late_rule(self) -> Self:
        if not _late_rule(self.status, self.minutes_late):
            raise ValueError("minutesLate is required when status is late and must be null otherwise")
        return self


class LeaveRequestOut(Timestamped):
    learner_id: Id
    requested_by_person_id: Id
    from_: date = Field(alias="from")
    to: date
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    status: Literal["pending", "approved", "rejected", "cancelled"]
    decided_by_staff_profile_id: Id | None
    decided_at: datetime | None

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.to < self.from_:
            raise ValueError("to must be on or after from")
        return self
