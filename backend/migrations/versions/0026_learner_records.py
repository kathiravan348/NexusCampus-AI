"""M13 learner records, encrypted fields and tenant-bound references (NEX-184)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0026_learner_records"
down_revision: str | None = "0025_configuration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("learners", "enrolments", "learner_documents")


def upgrade() -> None:
    op.create_index("uq_m13_profile_person", "role_profiles", ["id", "tenant_id", "person_id"], unique=True)
    op.create_table(
        "learners",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("campus_id", sa.String(ID), nullable=True),
        sa.Column("person_id", sa.String(ID), nullable=False),
        sa.Column("role_profile_id", sa.String(ID), nullable=False),
        sa.Column("learner_number", sa.String(40), nullable=False),
        sa.Column("admission_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("left_on", sa.Date(), nullable=True),
        sa.Column("health_flags", sa.Text(), nullable=True),
        sa.Column("custom_fields", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sensitive_custom_fields", sa.Text(), nullable=True),
        sa.Column("retention_state", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        sa.ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["role_profile_id", "tenant_id", "person_id"],
            ["role_profiles.id", "role_profiles.tenant_id", "role_profiles.person_id"],
        ),
        sa.UniqueConstraint("id", "tenant_id", name="uq_learners_ref_tenant"),
        sa.CheckConstraint("length(btrim(learner_number)) > 0", name="number_present"),
        sa.CheckConstraint(
            "status IN ('enrolled','on_leave','withdrawn','transferred_out','graduated','alumni')",
            name="status_valid",
        ),
        sa.CheckConstraint("(left_on IS NULL) = (status IN ('enrolled','on_leave'))", name="left_on_present"),
        sa.CheckConstraint("left_on >= admission_date", name="left_on_valid"),
        sa.CheckConstraint("retention_state IN ('active','archived','crypto_shredded')", name="retention_valid"),
        sa.CheckConstraint("health_flags ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'", name="health_encrypted"),
        sa.CheckConstraint(
            "sensitive_custom_fields ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'",
            name="custom_encrypted",
        ),
        sa.CheckConstraint("jsonb_typeof(custom_fields) = 'object'", name="custom_object"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )

    op.create_table(
        "enrolments",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("program_id", sa.String(ID), nullable=False),
        sa.Column("year_level_id", sa.String(ID), nullable=True),
        sa.Column("class_group_id", sa.String(ID), nullable=False),
        sa.Column("roll_number", sa.String(20), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        sa.ForeignKeyConstraint(
            ["class_group_id", "tenant_id", "academic_year_id"],
            ["class_groups.id", "class_groups.tenant_id", "class_groups.academic_year_id"],
        ),
        sa.CheckConstraint("status IN ('active','completed','withdrawn')", name="status_valid"),
        sa.CheckConstraint("length(btrim(roll_number)) > 0", name="roll_present"),
        sa.CheckConstraint("status = 'active' OR effective_to IS NOT NULL", name="effective_to_present"),
        sa.CheckConstraint("effective_to >= effective_from", name="dates_valid"),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_index("ix_enrolments_learner", "enrolments", ["tenant_id", "learner_id", "id"])

    op.create_table(
        "learner_documents",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("learner_id", sa.String(ID), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(16), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("verified_by_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["learner_id", "tenant_id"], ["learners.id", "learners.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["verified_by_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        sa.CheckConstraint(
            "kind IN ('birth_certificate','id_proof','transfer_certificate','photo','medical',"
            "'previous_report','other')",
            name="kind_valid",
        ),
        sa.CheckConstraint(
            "btrim(file_name) NOT IN ('', '.', '..') AND file_name !~ '[/:[:cntrl:]]' AND"
            " strpos(file_name, chr(92)) = 0",
            name="name_valid",
        ),
        sa.CheckConstraint(
            "content_type IN ('application/pdf','image/jpeg','image/png','image/webp')",
            name="type_valid",
        ),
        sa.CheckConstraint("size_bytes BETWEEN 1 AND 20000000", name="size_valid"),
        sa.CheckConstraint("verified = (verified_by_staff_profile_id IS NOT NULL)", name="verifier_valid"),
    )
    op.create_index("ix_learner_documents_learner", "learner_documents", ["tenant_id", "learner_id", "id"])

    op.execute(
        """
        CREATE FUNCTION m13_check_public_fields() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM custom_field_definitions d
            WHERE d.tenant_id = NEW.tenant_id AND d.entity = 'learner' AND d.sensitive
              AND NEW.custom_fields ? d.key
          ) THEN
            RAISE EXCEPTION 'Restricted learner fields must be encrypted' USING ERRCODE = '23514';
          END IF;
          RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER m13_public_fields BEFORE INSERT OR UPDATE OF tenant_id, custom_fields ON learners "
        "FOR EACH ROW EXECUTE FUNCTION m13_check_public_fields()"
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (tenant_id = current_setting('app.tenant_id', true)) "
            "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
        )
        op.execute(f"REVOKE ALL ON {table} FROM nexus_app")
        op.execute(f"GRANT SELECT ON {table} TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m13_check_public_fields()")
    op.drop_index("uq_m13_profile_person", table_name="role_profiles")
