"""Frozen staff admissions wire shapes."""

import re
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, ValidationError, field_validator, model_validator
from pydantic_core import PydanticCustomError

from nexus.core.schemas import Contract
from nexus.modules.m13.schemas import CustomFields
from nexus.modules.m15.schemas import Code, Id, Name, Record, Timestamps

Source = Literal["walk_in", "phone", "website", "public_form", "referral", "campaign", "event", "other"]
EnquiryStatus = Literal["new", "contacted", "visit_booked", "applied", "lost"]
Phone = Annotated[str, StringConstraints(pattern=r"^\+[1-9][0-9]{6,14}(?![\s\S])")]
# Use an absolute end assertion in both Python and the published JSON Schema.
EMAIL_PATTERN = (
    r"^(?!\.)(?!.*\.\.)[A-Za-z0-9_'+.\-]*[A-Za-z0-9_+\-]@"
    r"([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}(?![\s\S])"
)
Email = Annotated[str, StringConstraints(pattern=EMAIL_PATTERN, max_length=254)]


class EnquiryFields(Contract):
    model_config = ConfigDict(regex_engine="python-re", hide_input_in_errors=True)

    source: Source
    campus_id: Id | None
    contact_name: Name
    contact_phone: Phone | None
    contact_email: Email | None
    learner_name: Name
    program_id: Id | None
    follow_up_on: date | None

    @field_validator("contact_name", "learner_name")
    @classmethod
    def name_length(cls, value: str) -> str:
        # The frozen string limit counts UTF-16 code units, including surrogate pairs.
        if len(value.encode("utf-16-le")) > 400:
            raise ValueError("Invalid enquiry field")
        return value

    @model_validator(mode="after")
    def contact_required(self) -> Self:
        if self.contact_phone is None and self.contact_email is None:
            raise ValidationError.from_exception_data(
                type(self).__name__,
                [
                    {
                        "type": PydanticCustomError("missing_contact", "Invalid enquiry field"),
                        "loc": ("contactPhone",),
                        "input": None,
                    }
                ],
            )
        return self


class EnquiryIn(EnquiryFields):
    model_config = ConfigDict(validate_by_alias=True, validate_by_name=False)

    @field_validator("campus_id", "program_id", "contact_name", "learner_name")
    @classmethod
    def database_text(cls, value: str | None) -> str | None:
        if value is not None and "\x00" in value:
            raise ValueError("Invalid enquiry field")
        return value

    @field_validator("follow_up_on", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> object:
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value)):
            raise ValueError("Expected a calendar date")
        return value


class EnquiryOut(EnquiryFields, Record, Timestamps):
    institution_id: Id
    campaign_code: Code | None
    status: EnquiryStatus
    lost_reason: Annotated[str, Field(min_length=1, max_length=300)] | None
    assigned_staff_profile_id: Id | None


class ApplicationOut(Record, Timestamps):
    institution_id: Id
    enquiry_id: Id | None
    application_number: Annotated[str, Field(min_length=1, max_length=40)]
    form_id: Id
    academic_year_id: Id
    program_id: Id
    year_level_id: Id | None
    applicant_person_id: Id
    guardian_person_ids: Annotated[list[Id], Field(max_length=4)]
    answers: CustomFields
    document_ids: Annotated[list[Id], Field(max_length=30)]
    status: Literal[
        "draft",
        "submitted",
        "under_review",
        "test_scheduled",
        "offered",
        "waitlisted",
        "accepted",
        "rejected",
        "withdrawn",
        "enrolled",
    ]
    submitted_at: datetime | None
    decided_at: datetime | None


class AdmissionOfferOut(Record):
    application_id: Id
    class_group_id: Id | None
    expires_on: date
    status: Literal["open", "accepted", "declined", "expired", "revoked"]
    responded_at: datetime | None
    created_at: datetime


class WaitlistEntryOut(Record):
    application_id: Id
    program_id: Id
    position: Annotated[int, Field(ge=1)]
    added_at: datetime
