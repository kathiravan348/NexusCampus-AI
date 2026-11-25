"""Frozen M14 family read contracts."""

from datetime import date, datetime
from typing import Annotated, Literal, NotRequired, Self, TypedDict

from pydantic import AfterValidator, ConfigDict, Field, StringConstraints, field_validator, model_validator, with_config

from nexus.core.validation import COUNTRIES, check, is_locale
from nexus.modules.m15.schemas import Id, Name, Record, Timestamps

# CountryCodeSchema uses the regions named by Intl.DisplayNames, excluding pseudo-regions.
COUNTRY_CODES = COUNTRIES | {
    "AC",
    "AN",
    "BU",
    "CP",
    "CQ",
    "CS",
    "DD",
    "DG",
    "DY",
    "EA",
    "FX",
    "HV",
    "IC",
    "NH",
    "RH",
    "SU",
    "TA",
    "TP",
    "UK",
    "VD",
    "YD",
    "YU",
    "ZR",
}


def country_code(value: str) -> str:
    if value not in COUNTRY_CODES:
        raise ValueError("Unknown country code")
    return value


@with_config(ConfigDict(extra="forbid"))
class Address(TypedDict):
    line1: Name
    line2: NotRequired[Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]]
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    region: NotRequired[Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]]
    postalCode: NotRequired[Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]]
    countryCode: Annotated[str, AfterValidator(country_code)]


class UpdatedRecord(Record, Timestamps):
    @model_validator(mode="after")
    def ordered_timestamps(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("Update precedes creation")
        return self


class HouseholdOut(UpdatedRecord):
    name: Name
    address: Address | None
    learner_person_ids: Annotated[list[Id], Field(min_length=1, max_length=20)]
    guardian_person_ids: Annotated[list[Id], Field(max_length=10)]
    primary_language: str | None

    @field_validator("primary_language")
    @classmethod
    def valid_locale(cls, value: str | None) -> str | None:
        check(value is None or is_locale(value), "Must be a canonical BCP 47 locale, e.g. en-IN")
        return value

    @field_validator("learner_person_ids", "guardian_person_ids")
    @classmethod
    def unique_people(cls, ids: list[str]) -> list[str]:
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate person ID")
        return ids


class GuardianRelationshipOut(UpdatedRecord):
    guardian_person_id: Id
    learner_person_id: Id
    kind: Literal[
        "mother",
        "father",
        "parent",
        "step_parent",
        "grandparent",
        "legal_guardian",
        "foster_carer",
        "adult_sibling",
        "other",
    ]
    parental_responsibility: bool
    lives_with_learner: bool
    contact_priority: Annotated[int, Field(ge=1, le=10)]
    pickup_right: Literal["allowed", "not_allowed", "court_restricted"]
    court_order_note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None
    effective_from: date
    effective_to: date | None

    @model_validator(mode="after")
    def valid_relationship(self) -> Self:
        if self.guardian_person_id == self.learner_person_id:
            raise ValueError("Guardian and learner must differ")
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("End precedes start")
        if self.court_order_note is not None and self.pickup_right != "court_restricted":
            raise ValueError("Court note requires a court restriction")
        return self


class AuthorisedPickupOut(Record):
    learner_person_id: Id
    name: Name
    phone: Annotated[str, StringConstraints(pattern=r"^\+[1-9][0-9]{6,14}$")]
    relationship_label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    valid_from: date
    valid_to: date | None
    added_by_person_id: Id
    created_at: datetime

    @model_validator(mode="after")
    def ordered_dates(self) -> Self:
        if self.valid_to is not None and self.valid_to < self.valid_from:
            raise ValueError("End precedes start")
        return self
