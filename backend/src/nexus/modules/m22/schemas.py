"""Frozen M22 / M23 wire shapes (`frontend/packages/contracts/src/records.ts`)."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictBool, StringConstraints, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Record
from nexus.modules.m20.schemas import Number

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class ReportCardLine(Contract):
    subject_id: Id
    grade: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8)]
    marks_percent: Annotated[Number, Field(ge=0, le=100)] | None
    remark: Annotated[str, Field(max_length=300)] | None


class ReportCardOut(Record):
    learner_id: Id
    academic_year_id: Id
    period_id: Id | None
    template_id: Id
    lines: Annotated[list[ReportCardLine], Field(min_length=1, max_length=60)]
    overall_remark: Annotated[str, Field(max_length=1000)] | None
    status: Literal["draft", "approved", "published", "withdrawn"]
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if (self.status == "published") != (self.published_at is not None):
            raise ValueError("publishedAt is set exactly when status is published")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class ReportCardStatusIn(Contract):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    status: Literal["approved", "published", "withdrawn"]


class DocumentSignature(Contract):
    staff_profile_id: Id
    signed_at: datetime
    method: Literal["drawn", "digital_certificate", "otp"]


class IssuedDocumentReadOut(Record):
    learner_id: Id | None
    kind: Literal["bonafide", "transfer", "completion", "character", "transcript", "letter", "other"]
    number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    template_id: Id
    issued_on: date
    signatures: Annotated[list[DocumentSignature], Field(max_length=5)]
    verification_code: Annotated[str, StringConstraints(pattern=r"^[A-Z0-9]{10,16}$")]
    revoked: StrictBool
    revoked_reason: Reason | None

    @model_validator(mode="after")
    def reason_needs_revocation(self) -> Self:
        if self.revoked_reason is not None and not self.revoked:
            raise ValueError("A reason requires a revoked document")
        return self


class IssuedDocumentOut(IssuedDocumentReadOut):
    @model_validator(mode="after")
    def reason_iff_revoked(self) -> Self:
        if self.revoked != (self.revoked_reason is not None):
            raise ValueError("revokedReason is set exactly when revoked is true")
        return self


class RevokeIn(Contract):
    model_config = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)

    reason: Reason
