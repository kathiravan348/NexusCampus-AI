"""Read contracts for learner records, enrolments and document metadata."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m08.schemas import Key
from nexus.modules.m15.schemas import Id, Record, Timestamps

CustomValue = str | int | float | bool | list[str] | None
CustomFields = dict[Key, CustomValue]


class HealthFlag(Contract):
    kind: Literal["allergy", "medication", "condition", "dietary", "accessibility", "other"]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    note: Annotated[str, Field(max_length=500)] | None


class LearnerOut(Record, Timestamps):
    institution_id: Id
    campus_id: Id | None
    person_id: Id
    role_profile_id: Id
    learner_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    admission_date: date
    status: Literal["enrolled", "on_leave", "withdrawn", "transferred_out", "graduated", "alumni"]
    left_on: date | None
    health_flags: Annotated[list[HealthFlag], Field(max_length=20)]
    custom_fields: CustomFields
    retention_state: Literal["active", "archived", "crypto_shredded"]

    @model_validator(mode="after")
    def valid_dates(self) -> Self:
        if (self.left_on is None) != (self.status in ("enrolled", "on_leave")):
            raise ValueError("Departure date does not match learner status")
        if self.left_on is not None and self.left_on < self.admission_date:
            raise ValueError("Departure precedes admission")
        if self.updated_at < self.created_at:
            raise ValueError("Update precedes creation")
        return self


class EnrolmentOut(Record, Timestamps):
    learner_id: Id
    academic_year_id: Id
    program_id: Id
    year_level_id: Id | None
    class_group_id: Id
    roll_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] | None
    status: Literal["active", "completed", "withdrawn"]
    effective_from: date
    effective_to: date | None

    @model_validator(mode="after")
    def valid_dates(self) -> Self:
        if self.status != "active" and self.effective_to is None:
            raise ValueError("Closed enrolment requires an end date")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("End precedes start")
        if self.updated_at < self.created_at:
            raise ValueError("Update precedes creation")
        return self


class LearnerDocumentOut(Record):
    learner_id: Id
    kind: Literal[
        "birth_certificate", "id_proof", "transfer_certificate", "photo", "medical", "previous_report", "other"
    ]
    file_name: Annotated[str, Field(min_length=1, max_length=200)]
    content_type: Literal["application/pdf", "image/jpeg", "image/png", "image/webp"]
    size_bytes: Annotated[int, Field(ge=1, le=20_000_000)]
    verified: bool
    verified_by_staff_profile_id: Id | None
    uploaded_at: datetime

    @field_validator("file_name")
    @classmethod
    def plain_name(cls, name: str) -> str:
        if name.strip() in {"", ".", ".."} or any(c in "/:\\" or ord(c) < 32 for c in name):
            raise ValueError("Expected a plain file name")
        return name

    @model_validator(mode="after")
    def verifier_present(self) -> Self:
        if self.verified != (self.verified_by_staff_profile_id is not None):
            raise ValueError("Verification requires a staff profile")
        return self
