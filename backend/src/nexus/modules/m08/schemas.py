"""Frozen M08 configuration contracts from contracts/src/forms.ts."""

import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, Field, StringConstraints, ValidationError, field_validator, model_validator
from pydantic_core import InitErrorDetails, PydanticCustomError

from nexus.core.schemas import Contract

Id = Annotated[str, StringConstraints(min_length=1, max_length=128)]
Key = Annotated[str, StringConstraints(pattern=r"^[a-z][a-zA-Z0-9]{1,39}$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Entity = Literal["learner", "guardian", "staff", "enquiry", "application"]
FieldType = Literal["text", "long_text", "number", "date", "choice", "multi_choice", "boolean", "email", "phone"]
Flag = Annotated[bool, Field(strict=True)]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
MAX_SAFE_INTEGER = 9007199254740991

# Unicode language identifiers use canonical case for language, script, region and extensions.
_LOCALE = re.compile(
    r"(?:[a-z]{2,3}|[a-z]{5,8})(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?"
    r"(?P<variants>(?:-(?:[0-9][a-z0-9]{3}|[a-z0-9]{5,8}))*)"
    r"(?P<extensions>(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*)"
    r"(?:-x(?:-[a-z0-9]{1,8})+)?"
)


def _locale(value: str) -> str:
    match = _LOCALE.fullmatch(value)
    if match is None:
        raise ValueError("Invalid locale")
    variants = match["variants"].split("-")[1:]
    singletons = [part for part in match["extensions"].split("-") if len(part) == 1]
    if variants != sorted(set(variants)) or singletons != sorted(set(singletons)):
        raise ValueError("Invalid locale")
    return value


Locale = Annotated[str, AfterValidator(_locale)]
LabelText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Label = Annotated[dict[Locale, LabelText], Field(min_length=1)]


class FieldOption(Contract):
    value: Key
    label: Label


class Record(Contract):
    id: Id
    tenant_id: Id
    updated_at: datetime


class DatedRecord(Record):
    created_at: datetime

    @model_validator(mode="after")
    def ordered_dates(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("Update precedes creation")
        return self


class CustomFieldFields(Contract):
    entity: Entity
    key: Key
    label: Label
    type: FieldType
    required: Flag
    sensitive: Flag
    options: Annotated[list[FieldOption], Field(min_length=1, max_length=100)] | None = None
    min: Number | None = None
    max: Number | None = None
    order: Annotated[int, Field(strict=True, ge=0, le=MAX_SAFE_INTEGER)]

    @field_validator("order", mode="before")
    @classmethod
    def json_integer(cls, value: object) -> object:
        return int(value) if isinstance(value, float) and value.is_integer() else value

    @model_validator(mode="after")
    def validate_definition(self) -> Self:
        paths: list[str] = []
        if (self.options is not None) != (self.type in ("choice", "multi_choice")):
            paths.append("options")
        elif self.options and len({opt.value for opt in self.options}) != len(self.options):
            paths.append("options")
        if self.type != "number" and (self.min is not None or self.max is not None):
            paths.append("type")
        if self.min is not None and self.max is not None and self.max < self.min:
            paths.append("max")
        if paths:
            issues: list[InitErrorDetails] = [
                {"type": PydanticCustomError("invalid_field", "Invalid field definition"), "loc": (key,), "input": None}
                for key in paths
            ]
            raise ValidationError.from_exception_data(type(self).__name__, issues)
        return self


class CustomFieldIn(CustomFieldFields):
    @field_validator("min", "max", "options", mode="before")
    @classmethod
    def optional_but_not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("Omit unused fields")
        return value


class CustomFieldOut(CustomFieldFields, DatedRecord):
    archived: Flag


class FormOut(DatedRecord):
    entity: Entity
    name: Name
    field_keys: Annotated[list[Key], Field(min_length=1, max_length=80)]
    public: Flag
    published: Flag

    @model_validator(mode="after")
    def valid_form(self) -> Self:
        if self.public and self.entity not in ("enquiry", "application"):
            raise ValueError("Only admission forms may be public")
        if len(set(self.field_keys)) != len(self.field_keys):
            raise ValueError("Field keys must be unique")
        return self


class WorkflowStep(Contract):
    id: Id
    approver_role_id: Id
    sla_hours: Annotated[int, Field(strict=True, ge=1, le=720)] | None
    escalate_to_role_id: Id | None

    @model_validator(mode="after")
    def different_escalation_role(self) -> Self:
        if self.escalate_to_role_id == self.approver_role_id:
            raise ValueError("Escalation role must differ from the approver")
        return self


class WorkflowOut(DatedRecord):
    subject: Literal["application", "leave_request", "document_request", "fee_concession", "record_change"]
    name: Name
    steps: Annotated[list[WorkflowStep], Field(min_length=1, max_length=10)]
    active: Flag

    @field_validator("steps")
    @classmethod
    def distinct_steps(cls, steps: list[WorkflowStep]) -> list[WorkflowStep]:
        if len({step.id for step in steps}) != len(steps):
            raise ValueError("Step IDs must be unique")
        return steps


NUMBERING_PART = r"(?:[A-Za-z0-9/_-]|\{(?:YYYY|YY|CAMPUS)\})*"


class NumberingOut(Record):
    subject: Literal["learner", "application", "receipt", "invoice", "certificate"]
    pattern: Annotated[
        str,
        StringConstraints(
            max_length=60,
            pattern=rf"^{NUMBERING_PART}\{{SEQ:[1-9]\}}{NUMBERING_PART}$",
        ),
    ]
    resets_yearly: Flag
    next_sequence: Annotated[int, Field(strict=True, ge=1, le=MAX_SAFE_INTEGER)]
