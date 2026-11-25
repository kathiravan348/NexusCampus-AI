"""SQLAlchemy mappings for migration 0025_configuration."""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import DOUBLE_PRECISION, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column


class ConfigurationRow:
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Created:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


class CustomFieldDefinition(ConfigurationRow, Created, Base):
    __tablename__ = "custom_field_definitions"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id", name="uq_custom_field_definitions_ref_tenant"),
        UniqueConstraint("tenant_id", "entity", "key", name="uq_custom_field_entity_key"),
        CheckConstraint("entity IN ('learner', 'guardian', 'staff', 'enquiry', 'application')", name="entity_valid"),
        CheckConstraint("key ~ '^[a-z][a-zA-Z0-9]{1,39}$'", name="key_valid"),
        CheckConstraint("jsonb_typeof(label) = 'object' AND label <> '{}'::jsonb", name="label_valid"),
        CheckConstraint(
            "type IN ('text','long_text','number','date','choice','multi_choice','boolean','email','phone')",
            name="type_valid",
        ),
        CheckConstraint("(type IN ('choice','multi_choice')) = (options IS NOT NULL)", name="options_present"),
        CheckConstraint(
            "jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 1 AND 100",
            name="options_valid",
        ),
        CheckConstraint("type = 'number' OR (min IS NULL AND max IS NULL)", name="bounds_numeric"),
        CheckConstraint("min <= max", name="bounds_ordered"),
        CheckConstraint('"order" BETWEEN 0 AND 9007199254740991', name="order_valid"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    entity: Mapped[str] = mapped_column(String(16))
    key: Mapped[str] = mapped_column(String(40))
    label: Mapped[dict[str, str]] = mapped_column(JSONB())
    type: Mapped[str] = mapped_column(String(16))
    required: Mapped[bool] = mapped_column(Boolean())
    sensitive: Mapped[bool] = mapped_column(Boolean())
    options: Mapped[list[dict[str, object]] | None] = mapped_column(JSONB(none_as_null=True))
    min: Mapped[float | None] = mapped_column(DOUBLE_PRECISION())
    max: Mapped[float | None] = mapped_column(DOUBLE_PRECISION())
    order: Mapped[int] = mapped_column(BigInteger())
    archived: Mapped[bool] = mapped_column(Boolean())


class FormDefinition(ConfigurationRow, Created, Base):
    __tablename__ = "form_definitions"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id", name="uq_form_definitions_ref_tenant"),
        CheckConstraint("entity IN ('learner', 'guardian', 'staff', 'enquiry', 'application')", name="entity_valid"),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        CheckConstraint(
            "jsonb_typeof(field_keys) = 'array' AND jsonb_array_length(field_keys) BETWEEN 1 AND 80",
            name="field_keys_valid",
        ),
        CheckConstraint("NOT public OR entity IN ('enquiry', 'application')", name="public_entity"),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    entity: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(200))
    field_keys: Mapped[list[str]] = mapped_column(JSONB())
    public: Mapped[bool] = mapped_column(Boolean())
    published: Mapped[bool] = mapped_column(Boolean())


class WorkflowDefinition(ConfigurationRow, Created, Base):
    __tablename__ = "workflow_definitions"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id", name="uq_workflow_definitions_ref_tenant"),
        CheckConstraint(
            "subject IN ('application','leave_request','document_request','fee_concession','record_change')",
            name="subject_valid",
        ),
        CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        CheckConstraint(
            "jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 10",
            name="steps_valid",
        ),
        CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    subject: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(String(200))
    steps: Mapped[list[dict[str, object]]] = mapped_column(JSONB())
    active: Mapped[bool] = mapped_column(Boolean())


class NumberingFormat(ConfigurationRow, Base):
    __tablename__ = "numbering_formats"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id", name="uq_numbering_formats_ref_tenant"),
        CheckConstraint("subject IN ('learner','application','receipt','invoice','certificate')", name="subject_valid"),
        CheckConstraint("next_sequence BETWEEN 1 AND 9007199254740991", name="next_sequence_valid"),
    )
    subject: Mapped[str] = mapped_column(String(16))
    pattern: Mapped[str] = mapped_column(String(60))
    resets_yearly: Mapped[bool] = mapped_column(Boolean())
    next_sequence: Mapped[int] = mapped_column(BigInteger())
