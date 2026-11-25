"""Frozen M18 fee wire shapes (`frontend/packages/contracts/src/fees.ts`)."""

import itertools
import re
from datetime import UTC, date, datetime
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StringConstraints,
    field_validator,
    model_validator,
)

from nexus.core.schemas import Contract
from nexus.core.validation import is_currency
from nexus.modules.m15.schemas import Code, Id, Name, Record

SAFE = 2**53 - 1  # JavaScript safe integer: `z.int()`
NonNegative = Annotated[StrictInt, Field(ge=0, le=SAFE)]
Positive = Annotated[StrictInt, Field(ge=1, le=SAFE)]
BasisPoints = Annotated[StrictInt, Field(ge=0, le=10_000)]
Trimmed120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
UTC_TEXT = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")


def _currency(value: str) -> str:
    if not is_currency(value):
        raise ValueError("Must be an ISO 4217 currency code, e.g. INR")
    return value


Currency = Annotated[str, AfterValidator(_currency)]


class FeeHeadOut(Record):
    institution_id: Id
    code: Code
    name: Name
    tax_rate_basis_points: BasisPoints
    refundable: StrictBool
    active: StrictBool


class FeePlanLine(Contract):
    fee_head_id: Id
    amount: NonNegative


class FeePlanInstalment(Contract):
    code: Code
    due_on: date
    share_percent_basis_points: Annotated[StrictInt, Field(ge=1, le=10_000)]


class FeePlanOut(Record):
    institution_id: Id
    academic_year_id: Id
    program_id: Id | None
    year_level_id: Id | None
    name: Name
    currency: Currency
    lines: Annotated[list[FeePlanLine], Field(min_length=1, max_length=30)]
    instalments: Annotated[list[FeePlanInstalment], Field(min_length=1, max_length=24)]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        dues = [item.due_on for item in self.instalments]
        if len({line.fee_head_id for line in self.lines}) != len(self.lines):
            raise ValueError("lines has duplicate feeHeadId")
        if any(later <= earlier for earlier, later in itertools.pairwise(dues)):
            raise ValueError("instalment dueOn dates must be strictly ascending")
        if sum(item.share_percent_basis_points for item in self.instalments) != 10_000:
            raise ValueError("instalment sharePercentBasisPoints must sum to 10000")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class ConcessionOut(Record):
    learner_id: Id
    fee_plan_id: Id
    kind: Literal["sibling", "merit", "need_based", "staff_child", "scholarship", "award_credit", "other"]
    mode: Literal["percent", "fixed"]
    value: Positive
    reason: Reason
    approved_by_staff_profile_id: Id | None
    valid_from: date
    valid_to: date | None
    created_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.mode == "percent" and self.value > 10_000:
            raise ValueError("percent concession value must be between 1 and 10000 basis points")
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("validTo is before validFrom")
        return self


class FeeInvoiceLine(Contract):
    fee_head_id: Id
    description: Trimmed120
    amount: NonNegative
    discount: NonNegative
    tax: NonNegative

    @model_validator(mode="after")
    def discount_within_amount(self) -> Self:
        if self.discount > self.amount:
            raise ValueError("discount exceeds line amount")
        return self


InvoiceStatus = Literal["draft", "issued", "part_paid", "paid", "void", "written_off"]


class FeeInvoiceOut(Record):
    learner_id: Id
    invoice_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    currency: Currency
    issued_on: date
    due_on: date
    lines: Annotated[list[FeeInvoiceLine], Field(min_length=1, max_length=50)]
    total: NonNegative
    paid: NonNegative
    status: InvoiceStatus
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.due_on < self.issued_on:
            raise ValueError("dueOn is before issuedOn")
        if self.total != sum(line.amount - line.discount + line.tax for line in self.lines):
            raise ValueError("total does not match sum of lines (amount - discount + tax)")
        if self.paid > self.total:
            raise ValueError("paid exceeds total")
        status_ok = {
            "issued": self.paid == 0,
            "part_paid": 0 < self.paid < self.total,
            "paid": self.paid == self.total,
        }.get(self.status, True)
        if not status_ok:
            raise ValueError("status does not agree with paid amount")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


InvoiceIds = Annotated[list[Id], Field(min_length=1, max_length=20)]


class FeePaymentOut(Record):
    invoice_ids: InvoiceIds
    payer_person_id: Id
    currency: Currency
    amount: Positive
    method: Literal["cash", "cheque", "bank_transfer", "card", "upi", "wallet", "gateway"]
    gateway_reference: Trimmed120 | None
    receipt_number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    received_at: datetime
    status: Literal["pending", "succeeded", "failed", "reversed"]
    device_id: Id | None

    @model_validator(mode="after")
    def unique_invoices(self) -> Self:
        if len(set(self.invoice_ids)) != len(self.invoice_ids):
            raise ValueError("invoiceIds has duplicates")
        return self


class FeePaymentIn(Contract):
    """Manual cash, cheque or bank-transfer receipt (`FeePaymentInputSchema`)."""

    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    invoice_ids: InvoiceIds
    currency: Currency
    amount: Positive
    method: Literal["cash", "cheque", "bank_transfer"]
    received_at: datetime
    device_id: Id | None

    @field_validator("received_at", mode="before")
    @classmethod
    def utc_text(cls, value: object) -> object:
        # `z.iso.datetime()`: ISO text in UTC with `Z`; offsets and other shapes are rejected.
        if not isinstance(value, str) or not UTC_TEXT.fullmatch(value):
            raise ValueError("Expected an ISO date-time in UTC")
        return value

    @field_validator("received_at")
    @classmethod
    def aware(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)

    def rule_path(self) -> str | None:
        return None if len(set(self.invoice_ids)) == len(self.invoice_ids) else "invoiceIds"


class FeeRefundOut(Record):
    payment_id: Id
    amount: Positive
    reason: Reason
    status: Literal["requested", "approved", "paid", "rejected"]
    decided_by_staff_profile_id: Id | None
    decided_at: datetime | None
    created_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        decided = self.status != "requested"
        if (self.decided_by_staff_profile_id is not None) != decided or (self.decided_at is not None) != decided:
            raise ValueError("decision fields are set iff status is not requested")
        if self.decided_at is not None and self.decided_at < self.created_at:
            raise ValueError("decidedAt is before createdAt")
        return self
