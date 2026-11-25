"""Frozen M20 gradebook wire shapes (`frontend/packages/contracts/src/assessment.ts`)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import (
    BeforeValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StringConstraints,
    field_validator,
    model_validator,
)

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Name, Record


def _number(value: object) -> object:
    # NUMERIC columns come back as Decimal and JSON whole numbers as int; both are contract numbers.
    # Strings and booleans stay as they are, so the strict float rejects them.
    if isinstance(value, Decimal) or (isinstance(value, int) and not isinstance(value, bool)):
        return float(value)
    return value


Number = Annotated[StrictFloat, BeforeValidator(_number)]
Percent = Annotated[Number, Field(ge=0, le=100)]
RubricCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


def halves(value: float | None) -> bool:
    return value is None or (value * 2).is_integer()


class GradeBand(Contract):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8)]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    min_percent: Percent
    max_percent: Percent
    grade_point: Annotated[Number, Field(ge=0, le=10)] | None

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.min_percent > self.max_percent:
            raise ValueError("maxPercent is below minPercent")
        if self.grade_point is not None and abs(self.grade_point * 10 - round(self.grade_point * 10)) > 1e-9:
            raise ValueError("gradePoint must be a multiple of 0.1")
        return self


class GradingSchemeOut(Record):
    institution_id: Id
    name: Name
    kind: Literal["percent", "letter", "gpa", "descriptor", "competency"]
    bands: Annotated[list[GradeBand], Field(min_length=1, max_length=20)]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        ordered = sorted(self.bands, key=lambda band: (band.min_percent, band.max_percent))
        previous = 0.0
        for band in ordered:
            if band.min_percent != previous:
                raise ValueError("Grade bands must cover 0 to 100 without gaps or overlaps")
            previous = band.max_percent
        if previous != 100:
            raise ValueError("Grade bands must cover 0 to 100 without gaps or overlaps")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class AssessmentOut(Record):
    subject_offering_id: Id
    name: Name
    kind: Literal["test", "assignment", "project", "practical", "oral", "observation"]
    max_marks: Annotated[Number, Field(ge=1, le=1000)]
    weight_percent: Percent
    rubric_id: Id | None
    due_on: date | None
    status: Literal["draft", "open", "marking", "moderated", "published"]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not halves(self.max_marks):
            raise ValueError("maxMarks must be a multiple of 0.5")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class RubricLevel(Contract):
    score: Annotated[StrictInt, Field(ge=0, le=10)]
    descriptor: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class RubricCriterion(Contract):
    code: RubricCode
    label: Name
    levels: Annotated[list[RubricLevel], Field(min_length=2, max_length=6)]


class RubricOut(Record):
    name: Name
    criteria: Annotated[list[RubricCriterion], Field(min_length=1, max_length=20)]


class MarkFields(Contract):
    marks: Annotated[Number, Field(ge=0)] | None
    absent: StrictBool
    rubric_scores: dict[RubricCode, StrictInt] | None
    remark: Annotated[str, Field(max_length=500)] | None


class MarkEntryIn(MarkFields):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    @field_validator("marks")
    @classmethod
    def half_marks(cls, value: float | None) -> float | None:
        if not halves(value):
            raise ValueError("marks must be a multiple of 0.5")
        return value

    def rule_path(self) -> str | None:
        return "marks" if self.absent and self.marks is not None else None


class MarkEntryOut(MarkFields, Record):
    assessment_id: Id
    learner_id: Id
    entered_by_staff_profile_id: Id
    entered_at: datetime
    device_id: Id | None

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.absent and self.marks is not None:
            raise ValueError("marks must be null for an absent learner")
        if not halves(self.marks):
            raise ValueError("marks must be a multiple of 0.5")
        return self
