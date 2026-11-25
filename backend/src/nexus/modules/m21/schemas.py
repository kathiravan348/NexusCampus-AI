"""Frozen M21 exam wire shapes (`frontend/packages/contracts/src/exams.ts`)."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StrictBool, StringConstraints, model_validator

from nexus.modules.m15.schemas import Id, Name, Record
from nexus.modules.m16.schemas import TimeOfDay
from nexus.modules.m20.schemas import Number, halves

Marks = Annotated[Number, Field(ge=0)]


class ExamOut(Record):
    institution_id: Id
    academic_year_id: Id
    name: Name
    starts_on: date
    ends_on: date
    status: Literal["planned", "scheduled", "running", "results_pending", "published"]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.ends_on < self.starts_on:
            raise ValueError("endsOn is before startsOn")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class ExamPaperOut(Record):
    exam_id: Id
    subject_offering_id: Id
    date: date
    start: TimeOfDay
    end: TimeOfDay
    room_ids: Annotated[list[Id], Field(max_length=20)]
    max_marks: Annotated[Number, Field(ge=1, le=1000)]

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.end <= self.start:
            raise ValueError("end must be after start")
        if len(set(self.room_ids)) != len(self.room_ids):
            raise ValueError("roomIds has duplicates")
        if not halves(self.max_marks):
            raise ValueError("maxMarks must be a multiple of 0.5")
        return self


class SeatAssignmentOut(Record):
    exam_paper_id: Id
    learner_id: Id
    room_id: Id
    seat_label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10)]


class HallTicketOut(Record):
    exam_id: Id
    learner_id: Id
    ticket_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    issued_at: datetime
    revoked: StrictBool


class RevaluationRequestOut(Record):
    exam_paper_id: Id
    learner_id: Id
    reason: Annotated[str, Field(max_length=300)]
    status: Literal["requested", "in_review", "changed", "unchanged", "rejected"]
    old_marks: Marks
    new_marks: Marks | None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if (self.status == "changed") != (self.new_marks is not None):
            raise ValueError("newMarks is set exactly when status is changed")
        if not halves(self.old_marks) or not halves(self.new_marks):
            raise ValueError("marks must be multiples of 0.5")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self
