"""M01 tables (NEX-043). Columns mirror `frontend/packages/contracts/src/tenancy.ts` and `calendar.ts`;
the migration `0001_tenancy` creates them with Row-Level Security by `tenant_id`. A test compares these
models with the migrated database, so the two never drift.
"""

from datetime import date
from typing import Any

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, Timestamps, id_column

NAME = 200
LOCALE = 35
TIME_ZONE = 64
ENUM = 32


class Tenant(Timestamps, Base):
    """The customer boundary: a standalone institution or a group (E-6). Pinned to one region (G-5)."""

    __tablename__ = "tenants"
    id: Mapped[str] = id_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(NAME))
    type: Mapped[str] = mapped_column(String(ENUM))
    region: Mapped[str] = mapped_column(String(ENUM))


class Group(Timestamps, Base):
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("id", "tenant_id"),)
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(NAME))
    region: Mapped[str] = mapped_column(String(ENUM))


class Institution(Timestamps, Base):
    __tablename__ = "institutions"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id"),
        ForeignKeyConstraint(["group_id", "tenant_id"], ["groups.id", "groups.tenant_id"]),
        CheckConstraint("cardinality(supported_locales) >= 1", name="supported_locales_not_empty"),
        CheckConstraint("default_locale = ANY (supported_locales)", name="default_locale_supported"),
        CheckConstraint("weekend_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]", name="weekend_days_are_weekdays"),
        CheckConstraint("updated_at >= created_at", name="updated_not_before_created"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    group_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(NAME))
    type: Mapped[str] = mapped_column(String(ENUM))
    region: Mapped[str] = mapped_column(String(ENUM))
    status: Mapped[str] = mapped_column(String(ENUM))
    # LocaleSettings (G-1, G-2), stored on the institution.
    default_locale: Mapped[str] = mapped_column(String(LOCALE))
    supported_locales: Mapped[list[str]] = mapped_column(ARRAY(String(LOCALE)))
    time_zone: Mapped[str] = mapped_column(String(TIME_ZONE))
    currency: Mapped[str] = mapped_column(String(3))
    country: Mapped[str] = mapped_column(String(2))
    weekend_days: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger))


class Campus(Timestamps, Base):
    __tablename__ = "campuses"
    __table_args__ = (
        UniqueConstraint("institution_id", "code"),
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        CheckConstraint("code ~ '^[A-Z0-9-]{1,16}$'", name="code_format"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(NAME))
    time_zone: Mapped[str | None] = mapped_column(String(TIME_ZONE))
    #: Organisation address (contract `Address`), not personal data.
    address: Mapped[dict[str, Any]] = mapped_column(JSONB)


class AcademicCalendar(Timestamps, Base):
    __tablename__ = "academic_calendars"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        CheckConstraint("ends_on >= starts_on", name="year_not_reversed"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year: Mapped[str] = mapped_column(String(20))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    display_calendar: Mapped[str] = mapped_column(String(ENUM))
    #: `AcademicPeriod[]` and `Holiday[]`; overlap and range rules are checked by the API schemas (NEX-047).
    periods: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    holidays: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)


#: Every table with a `tenant_id` column gets the RLS policy (tenants itself uses `id`).
TENANT_TABLES = ("groups", "institutions", "campuses", "academic_calendars")
