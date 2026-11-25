"""Frozen M15 wire shapes from contracts/src/academics.ts."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, field_validator

from nexus.core.schemas import Contract

Id = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Code = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
GroupKind = Literal["section", "batch", "cohort", "group"]


class Record(Contract):
    id: Id
    tenant_id: Id


class Timestamps(Contract):
    created_at: datetime
    updated_at: datetime


class ProgramOut(Record, Timestamps):
    institution_id: Id
    code: Code
    name: Name
    kind: Literal["early_years", "school_stage", "degree", "diploma", "certificate", "course", "batch_program"]
    duration_years: Annotated[int, Field(ge=1, le=10)] | None
    active: bool


class YearLevelOut(Record):
    program_id: Id
    code: Code
    name: Name
    order: Annotated[int, Field(ge=1)]


class GroupFields(Contract):
    campus_id: Id | None
    academic_year_id: Id
    program_id: Id
    year_level_id: Id | None
    kind: GroupKind
    code: Code
    name: Name
    capacity: Annotated[int, Field(strict=True, ge=1, le=2000)] | None
    homeroom_staff_profile_id: Id | None


class ClassGroupIn(GroupFields):
    model_config = ConfigDict(validate_by_alias=True, validate_by_name=False)

    @field_validator("capacity", mode="before")
    @classmethod
    def json_integer(cls, value: object) -> object:
        # JSON numbers such as 12.0 satisfy the contract's integer check.
        return int(value) if isinstance(value, float) and value.is_integer() else value


class ClassGroupOut(GroupFields, Record, Timestamps):
    institution_id: Id


class SubjectOut(Record, Timestamps):
    institution_id: Id
    code: Code
    name: Name
    kind: Literal["core", "elective", "language", "activity", "lab", "project"]
    credits: Annotated[float, Field(ge=0, le=60, multiple_of=0.5)] | None
    active: bool


class SubjectOfferingOut(Record, Timestamps):
    academic_year_id: Id
    period_id: Id | None
    class_group_id: Id
    subject_id: Id
    staff_profile_ids: Annotated[list[Id], Field(max_length=10)]
    weekly_periods: Annotated[int, Field(ge=0, le=60)] | None
