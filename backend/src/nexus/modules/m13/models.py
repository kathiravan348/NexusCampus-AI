"""SQLAlchemy mappings for migration 0026_learner_records."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base
from nexus.modules.m15.models import AcademicRow, Timestamps


@event.listens_for(Table, "after_parent_attach")
def _index_profile_person(table: Table, metadata: MetaData) -> None:
    if metadata is Base.metadata and table.name == "role_profiles":
        Index("uq_m13_profile_person", table.c.id, table.c.tenant_id, table.c.person_id, unique=True)


if "role_profiles" in Base.metadata.tables:
    _index_profile_person(Base.metadata.tables["role_profiles"], Base.metadata)


class Learner(AcademicRow, Timestamps, Base):
    __tablename__ = "learners"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(
            ["role_profile_id", "tenant_id", "person_id"],
            ["role_profiles.id", "role_profiles.tenant_id", "role_profiles.person_id"],
        ),
        UniqueConstraint("id", "tenant_id", name="uq_learners_ref_tenant"),
        CheckConstraint("length(btrim(learner_number)) > 0", name="number_present"),
        CheckConstraint(
            "status IN ('enrolled','on_leave','withdrawn','transferred_out','graduated','alumni')",
            name="status_valid",
        ),
        CheckConstraint("(left_on IS NULL) = (status IN ('enrolled','on_leave'))", name="left_on_present"),
        CheckConstraint("left_on >= admission_date", name="left_on_valid"),
        CheckConstraint("retention_state IN ('active','archived','crypto_shredded')", name="retention_valid"),
        CheckConstraint("health_flags ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'", name="health_encrypted"),
        CheckConstraint(
            "sensitive_custom_fields ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'",
            name="custom_encrypted",
        ),
        CheckConstraint("jsonb_typeof(custom_fields) = 'object'", name="custom_object"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    campus_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    role_profile_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    learner_number: Mapped[str] = mapped_column(String(40))
    admission_date: Mapped[date] = mapped_column(Date())
    status: Mapped[str] = mapped_column(String(16))
    left_on: Mapped[date | None] = mapped_column(Date())
    health_flags: Mapped[str | None] = mapped_column(Text())
    custom_fields: Mapped[dict[str, object]] = mapped_column(JSONB(), server_default=text("'{}'::jsonb"))
    sensitive_custom_fields: Mapped[str | None] = mapped_column(Text())
    retention_state: Mapped[str] = mapped_column(String(16))


class Enrolment(AcademicRow, Timestamps, Base):
    __tablename__ = "enrolments"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        ForeignKeyConstraint(
            ["class_group_id", "tenant_id", "academic_year_id"],
            ["class_groups.id", "class_groups.tenant_id", "class_groups.academic_year_id"],
        ),
        CheckConstraint("status IN ('active','completed','withdrawn')", name="status_valid"),
        CheckConstraint("length(btrim(roll_number)) > 0", name="roll_present"),
        CheckConstraint("status = 'active' OR effective_to IS NOT NULL", name="effective_to_present"),
        CheckConstraint("effective_to >= effective_from", name="dates_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
        Index("ix_enrolments_learner", "tenant_id", "learner_id", "id"),
    )
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    year_level_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    class_group_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    roll_number: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(16))
    effective_from: Mapped[date] = mapped_column(Date())
    effective_to: Mapped[date | None] = mapped_column(Date())


class LearnerDocument(AcademicRow, Base):
    __tablename__ = "learner_documents"
    __table_args__ = (
        ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        ForeignKeyConstraint(
            ["verified_by_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        CheckConstraint(
            "kind IN ('birth_certificate','id_proof','transfer_certificate','photo','medical',"
            "'previous_report','other')",
            name="kind_valid",
        ),
        CheckConstraint(
            "btrim(file_name) NOT IN ('', '.', '..') AND file_name !~ '[/:[:cntrl:]]' AND"
            " strpos(file_name, chr(92)) = 0",
            name="name_valid",
        ),
        CheckConstraint(
            "content_type IN ('application/pdf','image/jpeg','image/png','image/webp')",
            name="type_valid",
        ),
        CheckConstraint("size_bytes BETWEEN 1 AND 20000000", name="size_valid"),
        CheckConstraint("verified = (verified_by_staff_profile_id IS NOT NULL)", name="verifier_valid"),
        Index("ix_learner_documents_learner", "tenant_id", "learner_id", "id"),
    )
    learner_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(24))
    file_name: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(16))
    size_bytes: Mapped[int] = mapped_column(Integer())
    verified: Mapped[bool] = mapped_column(Boolean())
    verified_by_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
