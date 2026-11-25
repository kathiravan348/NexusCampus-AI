"""Tenant configuration with forced row-level security (NEX-200)."""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import DOUBLE_PRECISION, JSONB

revision: str = "0025_configuration"
down_revision: str | None = "0024_academic_structure"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("custom_field_definitions", "form_definitions", "workflow_definitions", "numbering_formats")


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.String(128), sa.ForeignKey("tenants.id"), nullable=False, index=True)


def _timestamp(name: str) -> sa.Column[datetime]:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "custom_field_definitions",
        sa.Column("id", sa.String(128), primary_key=True),
        _tenant(),
        sa.Column("entity", sa.String(16), nullable=False),
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("label", JSONB(), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("sensitive", sa.Boolean(), nullable=False),
        sa.Column("options", JSONB(none_as_null=True), nullable=True),
        sa.Column("min", DOUBLE_PRECISION(), nullable=True),
        sa.Column("max", DOUBLE_PRECISION(), nullable=True),
        sa.Column("order", sa.BigInteger(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_custom_field_definitions_ref_tenant"),
        sa.UniqueConstraint("tenant_id", "entity", "key", name="uq_custom_field_entity_key"),
        sa.CheckConstraint("entity IN ('learner', 'guardian', 'staff', 'enquiry', 'application')", name="entity_valid"),
        sa.CheckConstraint("key ~ '^[a-z][a-zA-Z0-9]{1,39}$'", name="key_valid"),
        sa.CheckConstraint("jsonb_typeof(label) = 'object' AND label <> '{}'::jsonb", name="label_valid"),
        sa.CheckConstraint(
            "type IN ('text','long_text','number','date','choice','multi_choice','boolean','email','phone')",
            name="type_valid",
        ),
        sa.CheckConstraint("(type IN ('choice','multi_choice')) = (options IS NOT NULL)", name="options_present"),
        sa.CheckConstraint(
            "jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 1 AND 100",
            name="options_valid",
        ),
        sa.CheckConstraint("type = 'number' OR (min IS NULL AND max IS NULL)", name="bounds_numeric"),
        sa.CheckConstraint("min <= max", name="bounds_ordered"),
        sa.CheckConstraint('"order" BETWEEN 0 AND 9007199254740991', name="order_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "form_definitions",
        sa.Column("id", sa.String(128), primary_key=True),
        _tenant(),
        sa.Column("entity", sa.String(16), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("field_keys", JSONB(), nullable=False),
        sa.Column("public", sa.Boolean(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_form_definitions_ref_tenant"),
        sa.CheckConstraint("entity IN ('learner', 'guardian', 'staff', 'enquiry', 'application')", name="entity_valid"),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint(
            "jsonb_typeof(field_keys) = 'array' AND jsonb_array_length(field_keys) BETWEEN 1 AND 80",
            name="field_keys_valid",
        ),
        sa.CheckConstraint("NOT public OR entity IN ('enquiry', 'application')", name="public_entity"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "workflow_definitions",
        sa.Column("id", sa.String(128), primary_key=True),
        _tenant(),
        sa.Column("subject", sa.String(24), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("steps", JSONB(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_workflow_definitions_ref_tenant"),
        sa.CheckConstraint(
            "subject IN ('application','leave_request','document_request','fee_concession','record_change')",
            name="subject_valid",
        ),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_present"),
        sa.CheckConstraint(
            "jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) BETWEEN 1 AND 10",
            name="steps_valid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "numbering_formats",
        sa.Column("id", sa.String(128), primary_key=True),
        _tenant(),
        sa.Column("subject", sa.String(16), nullable=False),
        sa.Column("pattern", sa.String(60), nullable=False),
        sa.Column("resets_yearly", sa.Boolean(), nullable=False),
        sa.Column("next_sequence", sa.BigInteger(), nullable=False),
        _timestamp("updated_at"),
        sa.UniqueConstraint("id", "tenant_id", name="uq_numbering_formats_ref_tenant"),
        sa.CheckConstraint(
            "subject IN ('learner','application','receipt','invoice','certificate')",
            name="subject_valid",
        ),
        sa.CheckConstraint("next_sequence BETWEEN 1 AND 9007199254740991", name="next_sequence_valid"),
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")
    op.execute("GRANT INSERT ON custom_field_definitions TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
