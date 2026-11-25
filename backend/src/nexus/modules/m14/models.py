"""SQLAlchemy mappings for migration 0027_families."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base
from nexus.modules.m15.models import AcademicRow, Timestamps


class Household(AcademicRow, Timestamps, Base):
    __tablename__ = "households"
    __table_args__ = (
        CheckConstraint("length(id) > 0", name="id_present"),
        CheckConstraint("name ~ '[^[:space:]]'", name="name_present"),
        CheckConstraint("m14_address_valid(address)", name="address_valid"),
        CheckConstraint("m14_person_ids_valid(learner_person_ids, 1, 20)", name="learners_valid"),
        CheckConstraint("m14_person_ids_valid(guardian_person_ids, 0, 10)", name="guardians_valid"),
        CheckConstraint("m14_locale_valid(primary_language)", name="locale_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[dict[str, object] | None] = mapped_column(JSONB(none_as_null=True))
    learner_person_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    guardian_person_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    primary_language: Mapped[str | None] = mapped_column(Text())


class GuardianRelationship(AcademicRow, Timestamps, Base):
    __tablename__ = "guardian_relationships"
    __table_args__ = (
        ForeignKeyConstraint(["guardian_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(["learner_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        CheckConstraint("length(id) > 0", name="id_present"),
        CheckConstraint("guardian_person_id <> learner_person_id", name="different_people"),
        CheckConstraint(
            "kind IN ('mother','father','parent','step_parent','grandparent','legal_guardian',"
            "'foster_carer','adult_sibling','other')",
            name="kind_valid",
        ),
        CheckConstraint("contact_priority BETWEEN 1 AND 10", name="priority_valid"),
        CheckConstraint("pickup_right IN ('allowed','not_allowed','court_restricted')", name="right_valid"),
        CheckConstraint("(court_order_note IS NOT NULL) = (pickup_right = 'court_restricted')", name="note_present"),
        CheckConstraint("court_order_note ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'", name="note_encrypted"),
        CheckConstraint("effective_to >= effective_from", name="dates_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
        Index("ix_guardian_relationships_learner", "tenant_id", "learner_person_id", "id"),
    )
    guardian_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(16))
    parental_responsibility: Mapped[bool] = mapped_column(Boolean())
    lives_with_learner: Mapped[bool] = mapped_column(Boolean())
    contact_priority: Mapped[int] = mapped_column(Integer())
    pickup_right: Mapped[str] = mapped_column(String(16))
    court_order_note: Mapped[str | None] = mapped_column(Text())
    effective_from: Mapped[date] = mapped_column(Date())
    effective_to: Mapped[date | None] = mapped_column(Date())


class AuthorisedPickup(AcademicRow, Base):
    __tablename__ = "authorised_pickups"
    __table_args__ = (
        ForeignKeyConstraint(["learner_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(["added_by_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        CheckConstraint("length(id) > 0", name="id_present"),
        CheckConstraint("name ~ '[^[:space:]]'", name="name_present"),
        CheckConstraint("phone ~ '^[+][1-9][0-9]{6,14}$'", name="phone_valid"),
        CheckConstraint("relationship_label ~ '[^[:space:]]'", name="label_present"),
        CheckConstraint("valid_to >= valid_from", name="dates_valid"),
        Index("ix_authorised_pickups_learner", "tenant_id", "learner_person_id", "id"),
    )
    learner_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(16))
    relationship_label: Mapped[str] = mapped_column(String(60))
    valid_from: Mapped[date] = mapped_column(Date())
    valid_to: Mapped[date | None] = mapped_column(Date())
    added_by_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
