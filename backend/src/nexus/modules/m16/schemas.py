"""Frozen M16 timetable wire shapes (`frontend/packages/contracts/src/timetable.ts`)."""

import re
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictBool, StrictInt, StringConstraints, field_validator, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Code, Id, Name, Record

# Default (Rust) regex engine: `$` is the end of the text, so a trailing newline is rejected.
TimeOfDay = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
RoomKind = Literal["classroom", "lab", "hall", "library", "sports", "online", "other"]
ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class Timestamped(Record):
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def timestamps_in_order(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class RoomOut(Timestamped):
    institution_id: Id
    campus_id: Id | None
    code: Code
    name: Name
    kind: RoomKind
    capacity: Annotated[StrictInt, Field(ge=1, le=5000)] | None
    active: StrictBool


class BellPeriod(Contract):
    code: Code
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    start: TimeOfDay
    end: TimeOfDay
    is_break: StrictBool

    @model_validator(mode="after")
    def ends_after_start(self) -> Self:
        if self.end <= self.start:
            raise ValueError("Period end must be after start")
        return self


class BellScheduleOut(Timestamped):
    institution_id: Id
    name: Name
    periods: Annotated[list[BellPeriod], Field(min_length=1, max_length=20)]

    @model_validator(mode="after")
    def ascending(self) -> Self:
        for prev, curr in zip(self.periods, self.periods[1:], strict=False):
            if curr.start <= prev.start or curr.start < prev.end:
                raise ValueError("Periods must ascend without overlap")
        return self


class SlotFields(Contract):
    academic_year_id: Id
    period_id: Id | None
    subject_offering_id: Id
    weekday: Annotated[StrictInt, Field(ge=1, le=7)]
    start: TimeOfDay
    end: TimeOfDay
    room_id: Id | None
    staff_profile_ids: Annotated[list[Id], Field(max_length=10)]
    effective_from: date
    effective_to: date | None


class TimetableSlotIn(SlotFields):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    @field_validator("effective_from", "effective_to", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        if value is not None and (not isinstance(value, str) or not ISO_DATE.fullmatch(value)):
            raise ValueError("Expected a calendar date")
        return value

    @field_validator("academic_year_id", "period_id", "subject_offering_id", "room_id")
    @classmethod
    def database_text(cls, value: str | None) -> str | None:
        if value is not None and "\x00" in value:
            raise ValueError("Invalid timetable slot field")
        return value

    def rule_paths(self) -> list[str]:
        """The contract's refinements, run only when every field parsed (as Zod does)."""
        paths = []
        if self.end <= self.start:
            paths.append("end")
        if len(set(self.staff_profile_ids)) != len(self.staff_profile_ids):
            paths.append("staffProfileIds")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            paths.append("effectiveTo")
        return paths


class TimetableSlotOut(SlotFields, Timestamped):
    pass


class TeacherLoadOut(Contract):
    staff_profile_id: Id
    academic_year_id: Id
    period_id: Id | None
    weekly_periods: Annotated[StrictInt, Field(ge=0)]
    weekly_minutes: Annotated[StrictInt, Field(ge=0)]
    max_weekly_periods: Annotated[StrictInt, Field(ge=1)] | None
    overloaded: StrictBool
