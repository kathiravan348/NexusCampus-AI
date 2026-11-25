"""SQLAlchemy mappings for the staff admissions tables in revision 0028."""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base
from nexus.modules.m15.models import AcademicRow, ClassGroup

Index("uq_m12_class_group_ref", ClassGroup.id, ClassGroup.tenant_id, unique=True)


class AdmissionsRow(AcademicRow):
    # The mock appends records. Preserve that order across pages, including equal timestamps.
    list_order: Mapped[int] = mapped_column(BigInteger(), Identity())


class Enquiry(AdmissionsRow, Base):
    __tablename__ = "enquiries"
    __table_args__ = (
        CheckConstraint("length(id) > 0", name="id_present"),
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        ForeignKeyConstraint(
            ["assigned_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        UniqueConstraint("id", "tenant_id", name="uq_enquiries_ref_tenant"),
        CheckConstraint(
            "source IN ('walk_in','phone','website','public_form','referral','campaign','event','other')",
            name="source_valid",
        ),
        CheckConstraint("status IN ('new','contacted','visit_booked','applied','lost')", name="status_valid"),
        CheckConstraint("contact_phone IS NOT NULL OR contact_email IS NOT NULL", name="contact_present"),
        CheckConstraint("contact_phone ~ '^[+][1-9][0-9]{6,14}$'", name="phone_valid"),
        CheckConstraint(
            """contact_email COLLATE "C" ~ '^(?![.])(?!.*[.][.])[A-Za-z0-9_''+.-]*[A-Za-z0-9_+-]@"""
            "([A-Za-z0-9][A-Za-z0-9-]*[.])+[A-Za-z]{2,}$'",
            name="email_valid",
        ),
        CheckConstraint("contact_name ~ '[^[:space:]]' AND learner_name ~ '[^[:space:]]'", name="names_present"),
        CheckConstraint("campaign_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        CheckConstraint(
            "(lost_reason IS NOT NULL) = (status = 'lost') AND (lost_reason IS NULL OR lost_reason ~ '[^[:space:]]')",
            name="lost_reason_valid",
        ),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    campus_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    assigned_staff_profile_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    source: Mapped[str] = mapped_column(String(16))
    contact_name: Mapped[str] = mapped_column(String(200))
    contact_phone: Mapped[str | None] = mapped_column(String(16))
    contact_email: Mapped[str | None] = mapped_column(String(254))
    learner_name: Mapped[str] = mapped_column(String(200))
    follow_up_on: Mapped[date | None] = mapped_column(Date())
    campaign_code: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    lost_reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Application(AdmissionsRow, Base):
    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint("length(id) > 0", name="id_present"),
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        ForeignKeyConstraint(["enquiry_id", "tenant_id"], ["enquiries.id", "enquiries.tenant_id"]),
        ForeignKeyConstraint(["form_id", "tenant_id"], ["form_definitions.id", "form_definitions.tenant_id"]),
        ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        ForeignKeyConstraint(["applicant_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        UniqueConstraint("id", "tenant_id", name="uq_applications_ref_tenant"),
        CheckConstraint("application_number ~ '[^[:space:]]'", name="number_present"),
        CheckConstraint("m14_person_ids_valid(guardian_person_ids, 0, 4)", name="guardians_valid"),
        CheckConstraint("m14_person_ids_valid(document_ids, 0, 30)", name="documents_valid"),
        CheckConstraint("jsonb_typeof(answers) = 'object'", name="answers_object"),
        CheckConstraint("sensitive_answers ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'", name="answers_encrypted"),
        CheckConstraint(
            "status IN ('draft','submitted','under_review','test_scheduled','offered','waitlisted','accepted',"
            "'rejected','withdrawn','enrolled')",
            name="status_valid",
        ),
        CheckConstraint("(submitted_at IS NULL) = (status = 'draft')", name="submitted_at_valid"),
        CheckConstraint(
            "(decided_at IS NOT NULL) = (status IN ('offered','waitlisted','rejected','accepted','enrolled'))",
            name="decided_at_valid",
        ),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    enquiry_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    application_number: Mapped[str] = mapped_column(String(40))
    form_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    year_level_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    applicant_person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    guardian_person_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    answers: Mapped[dict[str, object]] = mapped_column(JSONB(), server_default=text("'{}'::jsonb"))
    sensitive_answers: Mapped[str | None] = mapped_column(Text())
    document_ids: Mapped[list[str]] = mapped_column(ARRAY(String(ID_LENGTH)))
    status: Mapped[str] = mapped_column(String(16))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class AdmissionOffer(AdmissionsRow, Base):
    __tablename__ = "admission_offers"
    __table_args__ = (
        CheckConstraint("length(id) > 0", name="id_present"),
        ForeignKeyConstraint(["application_id", "tenant_id"], ["applications.id", "applications.tenant_id"]),
        ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        CheckConstraint("status IN ('open','accepted','declined','expired','revoked')", name="status_valid"),
        CheckConstraint("(responded_at IS NOT NULL) = (status IN ('accepted','declined'))", name="responded_at_valid"),
    )
    application_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    class_group_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    expires_on: Mapped[date] = mapped_column(Date())
    status: Mapped[str] = mapped_column(String(16))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class WaitlistEntry(AdmissionsRow, Base):
    __tablename__ = "waitlist_entries"
    __table_args__ = (
        CheckConstraint("length(id) > 0", name="id_present"),
        ForeignKeyConstraint(["application_id", "tenant_id"], ["applications.id", "applications.tenant_id"]),
        ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        UniqueConstraint("tenant_id", "program_id", "position", name="uq_waitlist_program_position"),
        CheckConstraint("position >= 1", name="position_valid"),
    )
    application_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    program_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    position: Mapped[int] = mapped_column(Integer())
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class EnquiryForm(Base):
    """One public enquiry form per institution (revision 0029, D79)."""

    __tablename__ = "enquiry_forms"
    __table_args__ = (
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        UniqueConstraint("institution_id", name="uq_enquiry_forms_institution"),
        UniqueConstraint("id", "tenant_id", name="uq_enquiry_forms_ref_tenant"),
        CheckConstraint("id ~ '^pef-[0-9A-Za-z]{12,64}$'", name="id_valid"),
    )

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
