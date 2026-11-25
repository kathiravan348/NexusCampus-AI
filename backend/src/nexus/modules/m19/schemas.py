"""Frozen M19 accounting wire shapes (`frontend/packages/contracts/src/accounting.ts`)."""

import re
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictBool, StringConstraints, field_validator, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Name, Record
from nexus.modules.m18.schemas import Currency, NonNegative

ISO_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class LedgerAccountOut(Record):
    institution_id: Id
    code: Annotated[str, StringConstraints(pattern=r"^\d{3,10}$")]
    name: Name
    kind: Literal["asset", "liability", "equity", "income", "expense"]
    parent_id: Id | None
    active: StrictBool

    @model_validator(mode="after")
    def not_own_parent(self) -> Self:
        if self.parent_id == self.id:
            raise ValueError("parentId cannot equal id")
        return self


class JournalLine(Contract):
    account_id: Id
    debit: NonNegative
    credit: NonNegative

    @model_validator(mode="after")
    def one_side(self) -> Self:
        if (self.debit > 0) == (self.credit > 0):
            raise ValueError("exactly one of debit or credit must be greater than 0")
        return self


def balanced(lines: list[JournalLine]) -> bool:
    return sum(line.debit for line in lines) == sum(line.credit for line in lines)


class JournalFields(Contract):
    institution_id: Id
    posted_on: date
    reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    currency: Currency
    lines: Annotated[list[JournalLine], Field(min_length=2, max_length=100)]


class JournalEntryIn(JournalFields):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    @field_validator("posted_on", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
            raise ValueError("Expected a calendar date")
        return value

    @field_validator("institution_id", "reference")
    @classmethod
    def database_text(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("Invalid journal entry field")
        return value


class JournalEntryOut(JournalFields, Record):
    source: Literal["manual", "fees", "payroll", "import"]
    created_at: datetime

    @model_validator(mode="after")
    def is_balanced(self) -> Self:
        if not balanced(self.lines):
            raise ValueError("M19 journal entry must have matching debit and credit totals")
        return self


class BudgetLine(Contract):
    account_id: Id
    amount: NonNegative


class BudgetOut(Record):
    institution_id: Id
    academic_year_id: Id
    currency: Currency
    lines: Annotated[list[BudgetLine], Field(min_length=1, max_length=200)]
    status: Literal["draft", "approved", "closed"]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if len({line.account_id for line in self.lines}) != len(self.lines):
            raise ValueError("budget lines have duplicate accountId")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self
