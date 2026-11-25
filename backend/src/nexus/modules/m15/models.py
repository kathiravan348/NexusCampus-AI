"""SQLAlchemy mappings for migration 0024_academic_structure."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

# These indexes belong to the M15 migration but support FKs into existing modules.
# Attach them whether the parent mappings load before or after the M15 mappings.
_INDEXED_PARENTS = ("campuses", "academic_calendars", "role_profiles")


@event.listens_for(Table, "after_parent_attach")
def _index_tenant_reference(table: Table, metadata: MetaData) -> None:
    if metadata is Base.metadata and table.name in _INDEXED_PARENTS:
        Index(f"uq_m15_{table.name}_ref", table.c.id, table.c.tenant_id, unique=True)


for _parent in _INDEXED_PARENTS:
    if _parent in Base.metadata.tables:
        _index_tenant_reference(Base.metadata.tables[_parent], Base.metadata)


class AcademicRow:
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Program(AcademicRow, Timestamps, Base):
    __tablename__ = "programs"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        UniqueConstraint("id", "tenant_id", "institution_id", name="uq_programs_ref_tenant_institution"),
        UniqueConstraint("id", "tenant_id", name="uq_programs_ref_tenant"),
        CheckConstraint(
            "kind IN ('early_years', 'school_stage', 'degree', 'diploma', 'certificate', 'course', 'batch_program')",
            name="kind_valid",
        ),
        CheckConstraint("duration_years BETWEEN 1 AND 10", name="duration_years_valid"),
        CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
        Index("uq_programs_code", "institution_id", text("lower(code)"), unique=True),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    duration_years: Mapped[int | None] = mapped_column(Integer())
    active: Mapped[bool] = mapped_column(Boolean())


class YearLevel(AcademicRow, Base):
    __tablename__ = "year_levels"
    __table_args__ = (
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        UniqueConstraint("id", "tenant_id", "program_id", name="uq_year_levels_ref_tenant_program"),
        UniqueConstraint("program_id", "order", name="uq_year_levels_program_order"),
        CheckConstraint('"order" >= 1', name="order_positive"),
        CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        Index("uq_year_levels_code", "program_id", text("lower(code)"), unique=True),
    )
    program_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    order: Mapped[int] = mapped_column(Integer())


class ClassGroup(AcademicRow, Timestamps, Base):
    __tablename__ = "class_groups"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        ForeignKeyConstraint(
            ["program_id", "tenant_id", "institution_id"],
            ["programs.id", "programs.tenant_id", "programs.institution_id"],
        ),
        ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        ForeignKeyConstraint(
            ["homeroom_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        UniqueConstraint("id", "tenant_id", "academic_year_id", name="uq_class_groups_ref_tenant_academic_year"),
        CheckConstraint("kind IN ('section', 'batch', 'cohort', 'group')", name="kind_valid"),
        CheckConstraint("capacity BETWEEN 1 AND 2000", name="capacity_valid"),
        CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
        Index("uq_class_groups_code", "academic_year_id", text("lower(code)"), unique=True),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    campus_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    year_level_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(16))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int | None] = mapped_column(Integer())
    homeroom_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class Subject(AcademicRow, Timestamps, Base):
    __tablename__ = "subjects"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_subjects_ref_tenant"),
        CheckConstraint("kind IN ('core', 'elective', 'language', 'activity', 'lab', 'project')", name="kind_valid"),
        CheckConstraint("credits BETWEEN 0 AND 60 AND credits * 2 = trunc(credits * 2)", name="credits_valid"),
        CheckConstraint("code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
        Index("uq_subjects_code", "institution_id", text("lower(code)"), unique=True),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    code: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))
    credits: Mapped[Decimal | None] = mapped_column(Numeric())
    active: Mapped[bool] = mapped_column(Boolean())


class SubjectOffering(AcademicRow, Timestamps, Base):
    __tablename__ = "subject_offerings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        ForeignKeyConstraint(
            ["class_group_id", "tenant_id", "academic_year_id"],
            ["class_groups.id", "class_groups.tenant_id", "class_groups.academic_year_id"],
        ),
        ForeignKeyConstraint(["subject_id", "tenant_id"], ["subjects.id", "subjects.tenant_id"]),
        CheckConstraint("weekly_periods BETWEEN 0 AND 60", name="weekly_periods_valid"),
        CheckConstraint("m15_staff_ids_valid(staff_profile_ids)", name="staff_ids_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    period_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    class_group_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    subject_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    staff_profile_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    weekly_periods: Mapped[int | None] = mapped_column(Integer())
