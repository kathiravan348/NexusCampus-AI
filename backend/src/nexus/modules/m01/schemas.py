"""M01 API models = `contracts/src/tenancy.ts` and `calendar.ts` (camelCase JSON, strict), plus the
cross-field rules of their Zod `refine`s as `*_issues` functions (same paths and messages).
"""

import re
from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, SerializerFunctionWrapHandler, field_validator, model_serializer

from nexus.core.bodies import Issue
from nexus.core.schemas import Contract
from nexus.core.validation import check, is_country, is_currency, is_locale, is_time_zone

Name = Field(min_length=1, max_length=200)
Id = Field(min_length=1, max_length=128)
InstitutionType = Literal["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"]
Region = Literal["in", "eu", "us", "me", "apac"]
DisplayCalendar = Literal["gregory", "islamic-umalqura", "hebrew", "indian"]


class LocaleSettings(Contract):
    default_locale: str
    supported_locales: list[str] = Field(min_length=1)
    time_zone: str
    currency: str
    country: str
    weekend_days: list[int] = Field(max_length=7)

    @field_validator("default_locale")
    @classmethod
    def _locale(cls, v: str) -> str:
        check(is_locale(v), "Must be a canonical BCP 47 locale, e.g. en-IN")
        return v

    @field_validator("supported_locales")
    @classmethod
    def _locales(cls, v: list[str]) -> list[str]:
        for item in v:
            check(is_locale(item), "Must be a canonical BCP 47 locale, e.g. en-IN")
        return v

    @field_validator("time_zone")
    @classmethod
    def _zone(cls, v: str) -> str:
        check(is_time_zone(v), "Must be an IANA time zone, e.g. Asia/Kolkata or UTC")
        return v

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        check(is_currency(v), "Must be an ISO 4217 currency code, e.g. INR")
        return v

    @field_validator("country")
    @classmethod
    def _country(cls, v: str) -> str:
        check(is_country(v), "Must be an ISO 3166-1 alpha-2 country code, e.g. IN")
        return v

    @field_validator("weekend_days")
    @classmethod
    def _weekdays(cls, v: list[int]) -> list[int]:
        for d in v:
            check(0 <= d <= 6, "Must be 0 (Sunday) to 6 (Saturday)")
        return v


def locale_issues(raw: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    supported = raw.get("supportedLocales")
    if isinstance(supported, list):
        if raw.get("defaultLocale") not in supported:
            issues.append(("supportedLocales", "supportedLocales must include defaultLocale"))
        if len(set(map(str, supported))) != len(supported):
            issues.append(("supportedLocales", "supportedLocales has duplicates"))
    weekend = raw.get("weekendDays")
    if isinstance(weekend, list) and len(set(map(str, weekend))) != len(weekend):
        issues.append(("weekendDays", "weekendDays has duplicates"))
    return issues


class GroupOut(Contract):
    id: str
    tenant_id: str
    name: str
    region: Region
    created_at: datetime
    updated_at: datetime


class InstitutionOut(Contract):
    id: str
    tenant_id: str
    group_id: str | None
    name: str
    type: InstitutionType
    region: Region
    locale: LocaleSettings
    status: Literal["active", "trial", "suspended"]
    created_at: datetime
    updated_at: datetime


class Address(Contract):
    line1: str = Field(min_length=1, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    region: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country_code: str

    @field_validator("line1", "line2", "city", "region", "postal_code", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v

    @field_validator("country_code")
    @classmethod
    def _country(cls, v: str) -> str:
        check(is_country(v), "Must be an ISO 3166-1 alpha-2 country code, e.g. IN")
        return v

    @model_serializer(mode="wrap")
    def _drop_absent(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        # Contract `Address`: optional fields are absent, never null.
        data: dict[str, Any] = handler(self)
        return {k: v for k, v in data.items() if v is not None}


class CampusInput(Contract):
    institution_id: str = Id
    code: str
    name: str = Name
    time_zone: str | None
    address: Address

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        check(bool(re.fullmatch(r"[A-Z0-9-]{1,16}", v)), "Use A–Z, 0–9 and -, at most 16")  # noqa: RUF001
        return v

    @field_validator("time_zone")
    @classmethod
    def _zone(cls, v: str | None) -> str | None:
        check(v is None or is_time_zone(v), "Must be an IANA time zone, e.g. Asia/Kolkata or UTC")
        return v


class CampusOut(CampusInput):
    id: str
    tenant_id: str


class TenantOut(Contract):
    group: GroupOut | None
    institutions: list[InstitutionOut]
    campuses: list[CampusOut]


class TypeProfileOut(Contract):
    type: InstitutionType
    default_modules: list[str]
    structure: Literal["terms", "semesters", "trimesters", "rolling"]
    grading_scheme: str
    terminology_pack: InstitutionType


class Period(Contract):
    id: str = Id
    kind: Literal["term", "semester", "trimester", "session", "block"]
    name: str = Name
    starts_on: date
    ends_on: date


class Holiday(Contract):
    date: date
    name: str = Name


class CalendarInput(Contract):
    """Body of `PUT …/calendars/:id`; `id`, `tenantId`, `institutionId` may be sent and are ignored."""

    id: str | None = None
    tenant_id: str | None = None
    institution_id: str | None = None
    academic_year: str = Field(min_length=1, max_length=20)
    starts_on: date
    ends_on: date
    periods: list[Period]
    holidays: list[Holiday]
    display_calendar: DisplayCalendar


class CalendarOut(Contract):
    id: str
    tenant_id: str
    institution_id: str
    academic_year: str
    starts_on: date
    ends_on: date
    periods: list[Period]
    holidays: list[Holiday]
    display_calendar: DisplayCalendar


def calendar_issues(raw: dict[str, Any]) -> list[Issue]:
    """The `superRefine` of `AcademicCalendarSchema` (ISO dates compare correctly as text)."""
    issues: list[Issue] = []
    start, end = str(raw["startsOn"]), str(raw["endsOn"])
    if end < start:
        issues.append(("endsOn", "The year ends before it starts"))
    periods = [(i, p) for i, p in enumerate(raw.get("periods") or []) if isinstance(p, dict)]
    ordered = sorted(periods, key=lambda ip: str(ip[1]["startsOn"]))
    for i, p in ordered:
        if str(p["endsOn"]) < str(p["startsOn"]):
            issues.append((f"periods.{i}.endsOn", "Period ends before it starts"))
        if str(p["startsOn"]) < start or str(p["endsOn"]) > end:
            issues.append((f"periods.{i}", "Period is outside the academic year"))
    latest = ordered[0][1] if ordered else None
    for i, cur in ordered[1:]:
        if latest is not None and str(cur["startsOn"]) <= str(latest["endsOn"]):
            issues.append((f"periods.{i}", f'Period overlaps "{latest["name"]}"'))
        if latest is None or str(cur["endsOn"]) > str(latest["endsOn"]):
            latest = cur
    for i, h in enumerate(raw.get("holidays") or []):
        if isinstance(h, dict) and not start <= str(h["date"]) <= end:
            issues.append((f"holidays.{i}.date", "Holiday is outside the academic year"))
    return issues
