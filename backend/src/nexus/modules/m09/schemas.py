"""Frozen M09 import wire shapes (`frontend/packages/contracts/src/imports.ts`)."""

import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictInt, StringConstraints, field_validator, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Record

Entity = Literal["learner", "guardian", "staff", "enrolment", "fee_balance", "mark"]
SourceFormat = Literal["csv", "xlsx"]
Status = Literal["uploaded", "mapped", "dry_run_ready", "importing", "completed", "failed", "rolled_back"]
Transform = Literal["none", "trim", "upper", "lower", "date_dmy", "date_mdy", "phone_in", "split_name"]
Count = Annotated[StrictInt, Field(ge=0)]

FIELD_PATH = re.compile(r"[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)?")
CUSTOM_KEY = re.compile(r"[a-z][a-zA-Z0-9]{1,39}")
MESSAGE_KEY = r"^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$"


def plain_file_name(name: str) -> str:
    """The contract's `ImportFileNameSchema`: 1-200 UTF-16 units, a plain name, no control characters."""
    units = len(name.encode("utf-16-le")) // 2
    trimmed = name.strip()
    if (
        not 1 <= units <= 200
        or trimmed in {"", ".", ".."}
        or re.search(r"[/:\\]", name)
        or any(ord(ch) < 32 for ch in name)
    ):
        raise ValueError("fileName must be a plain file name")
    return name


class ImportJobIn(Contract):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    entity: Entity
    file_name: str
    source_format: SourceFormat

    @field_validator("file_name")
    @classmethod
    def file_name_plain(cls, value: str) -> str:
        return plain_file_name(value)


class ImportJobOut(Record):
    entity: Entity
    file_name: str
    source_format: SourceFormat
    template_version: Annotated[StrictInt, Field(ge=1)]
    status: Status
    total_rows: Count
    valid_rows: Count
    error_rows: Count
    created_by_staff_profile_id: Id
    rollback_until: datetime | None
    created_at: datetime
    updated_at: datetime

    @field_validator("file_name")
    @classmethod
    def file_name_plain(cls, value: str) -> str:
        return plain_file_name(value)

    @model_validator(mode="after")
    def contract_rules(self) -> Self:
        if self.valid_rows + self.error_rows > self.total_rows:
            raise ValueError("Valid and error rows cannot exceed total rows")
        if (self.rollback_until is not None) != (self.status == "completed"):
            raise ValueError("rollbackUntil is set exactly when the import is completed")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class MappedColumn(Contract):
    source_header: Annotated[str, Field(min_length=1, max_length=120)]
    target: str | None
    transform: Transform

    @field_validator("target")
    @classmethod
    def target_valid(cls, value: str | None) -> str | None:
        if value is None or FIELD_PATH.fullmatch(value):
            return value
        if value.startswith("custom:") and CUSTOM_KEY.fullmatch(value.removeprefix("custom:")):
            return value
        raise ValueError("Target must be a field path or a custom field key prefixed with custom:")


class ColumnMappingOut(Contract):
    job_id: Id
    columns: Annotated[list[MappedColumn], Field(min_length=1, max_length=200)]

    @model_validator(mode="after")
    def unique_targets(self) -> Self:
        targets = [column.target for column in self.columns if column.target is not None]
        if len(set(targets)) != len(targets):
            raise ValueError("Mapping targets must be unique")
        return self


class ImportRowIssueOut(Contract):
    row_number: Annotated[StrictInt, Field(ge=1)]
    column: Annotated[str, Field(min_length=1, max_length=120)] | None
    severity: Literal["error", "warning"]
    code: Annotated[str, StringConstraints(pattern=r"^[a-z_]{3,40}$")]
    message_key: Annotated[str, StringConstraints(pattern=MESSAGE_KEY)]
