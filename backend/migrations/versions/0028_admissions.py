"""Staff admissions tables (M12, NEX-185)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "0028_admissions"
down_revision: str | None = "0027_families"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
TABLES = ("enquiries", "applications", "admission_offers", "waitlist_entries")


def upgrade() -> None:
    op.create_index("uq_m12_class_group_ref", "class_groups", ["id", "tenant_id"], unique=True)
    op.create_table(
        "enquiries",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("campus_id", sa.String(ID), nullable=True),
        sa.Column("program_id", sa.String(ID), nullable=True),
        sa.Column("assigned_staff_profile_id", sa.String(ID), nullable=True),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=False),
        sa.Column("contact_phone", sa.String(16), nullable=True),
        sa.Column("contact_email", sa.String(254), nullable=True),
        sa.Column("learner_name", sa.String(200), nullable=False),
        sa.Column("follow_up_on", sa.Date(), nullable=True),
        sa.Column("campaign_code", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("lost_reason", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["campus_id", "tenant_id"], ["campuses.id", "campuses.tenant_id"]),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["assigned_staff_profile_id", "tenant_id"],
            ["role_profiles.id", "role_profiles.tenant_id"],
        ),
        sa.UniqueConstraint("id", "tenant_id", name="uq_enquiries_ref_tenant"),
        sa.CheckConstraint(
            "source IN ('walk_in','phone','website','public_form','referral','campaign','event','other')",
            name="source_valid",
        ),
        sa.CheckConstraint("status IN ('new','contacted','visit_booked','applied','lost')", name="status_valid"),
        sa.CheckConstraint("contact_phone IS NOT NULL OR contact_email IS NOT NULL", name="contact_present"),
        sa.CheckConstraint("contact_phone ~ '^[+][1-9][0-9]{6,14}$'", name="phone_valid"),
        sa.CheckConstraint(
            """contact_email COLLATE "C" ~ '^(?![.])(?!.*[.][.])[A-Za-z0-9_''+.-]*[A-Za-z0-9_+-]@"""
            "([A-Za-z0-9][A-Za-z0-9-]*[.])+[A-Za-z]{2,}$'",
            name="email_valid",
        ),
        sa.CheckConstraint("contact_name ~ '[^[:space:]]' AND learner_name ~ '[^[:space:]]'", name="names_present"),
        sa.CheckConstraint("campaign_code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'", name="code_valid"),
        sa.CheckConstraint(
            "(lost_reason IS NOT NULL) = (status = 'lost') AND (lost_reason IS NULL OR lost_reason ~ '[^[:space:]]')",
            name="lost_reason_valid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "applications",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("institution_id", sa.String(ID), nullable=False),
        sa.Column("enquiry_id", sa.String(ID), nullable=True),
        sa.Column("application_number", sa.String(40), nullable=False),
        sa.Column("form_id", sa.String(ID), nullable=False),
        sa.Column("academic_year_id", sa.String(ID), nullable=False),
        sa.Column("program_id", sa.String(ID), nullable=False),
        sa.Column("year_level_id", sa.String(ID), nullable=True),
        sa.Column("applicant_person_id", sa.String(ID), nullable=False),
        sa.Column("guardian_person_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("answers", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sensitive_answers", sa.Text(), nullable=True),
        sa.Column("document_ids", ARRAY(sa.String(ID)), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        sa.ForeignKeyConstraint(["enquiry_id", "tenant_id"], ["enquiries.id", "enquiries.tenant_id"]),
        sa.ForeignKeyConstraint(["form_id", "tenant_id"], ["form_definitions.id", "form_definitions.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["academic_year_id", "tenant_id"],
            ["academic_calendars.id", "academic_calendars.tenant_id"],
        ),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.ForeignKeyConstraint(
            ["year_level_id", "tenant_id", "program_id"],
            ["year_levels.id", "year_levels.tenant_id", "year_levels.program_id"],
        ),
        sa.ForeignKeyConstraint(["applicant_person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        sa.UniqueConstraint("id", "tenant_id", name="uq_applications_ref_tenant"),
        sa.CheckConstraint("application_number ~ '[^[:space:]]'", name="number_present"),
        sa.CheckConstraint("m14_person_ids_valid(guardian_person_ids, 0, 4)", name="guardians_valid"),
        sa.CheckConstraint("m14_person_ids_valid(document_ids, 0, 30)", name="documents_valid"),
        sa.CheckConstraint("jsonb_typeof(answers) = 'object'", name="answers_object"),
        sa.CheckConstraint(
            "sensitive_answers ~ '^v1:[0-9]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'",
            name="answers_encrypted",
        ),
        sa.CheckConstraint(
            "status IN ('draft','submitted','under_review','test_scheduled','offered','waitlisted','accepted',"
            "'rejected','withdrawn','enrolled')",
            name="status_valid",
        ),
        sa.CheckConstraint("(submitted_at IS NULL) = (status = 'draft')", name="submitted_at_valid"),
        sa.CheckConstraint(
            "(decided_at IS NOT NULL) = (status IN ('offered','waitlisted','rejected','accepted','enrolled'))",
            name="decided_at_valid",
        ),
        sa.CheckConstraint("updated_at >= created_at", name="updated_at_valid"),
    )
    op.create_table(
        "admission_offers",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("application_id", sa.String(ID), nullable=False),
        sa.Column("class_group_id", sa.String(ID), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.ForeignKeyConstraint(["application_id", "tenant_id"], ["applications.id", "applications.tenant_id"]),
        sa.ForeignKeyConstraint(["class_group_id", "tenant_id"], ["class_groups.id", "class_groups.tenant_id"]),
        sa.CheckConstraint("status IN ('open','accepted','declined','expired','revoked')", name="status_valid"),
        sa.CheckConstraint(
            "(responded_at IS NOT NULL) = (status IN ('accepted','declined'))",
            name="responded_at_valid",
        ),
    )
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("list_order", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("application_id", sa.String(ID), nullable=False),
        sa.Column("program_id", sa.String(ID), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("length(id) > 0", name="id_present"),
        sa.ForeignKeyConstraint(["application_id", "tenant_id"], ["applications.id", "applications.tenant_id"]),
        sa.ForeignKeyConstraint(["program_id", "tenant_id"], ["programs.id", "programs.tenant_id"]),
        sa.UniqueConstraint("tenant_id", "program_id", "position", name="uq_waitlist_program_position"),
        sa.CheckConstraint("position >= 1", name="position_valid"),
    )

    op.execute(
        """
        CREATE FUNCTION m12_validate_application() RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM custom_field_definitions f WHERE f.tenant_id = NEW.tenant_id
            AND f.entity = 'application' AND f.sensitive AND NEW.answers ? f.key
          ) THEN
            RAISE EXCEPTION 'Sensitive application answer requires encryption' USING ERRCODE = '23514';
          END IF;
          IF EXISTS (
            SELECT 1 FROM unnest(NEW.guardian_person_ids) g(id)
            WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.tenant_id = NEW.tenant_id AND p.id = g.id)
          ) THEN
            RAISE EXCEPTION 'Unknown guardian in tenant' USING ERRCODE = '23503';
          END IF;
          RETURN NEW;
        END;
        $function$;
        """
    )
    op.execute(
        "CREATE TRIGGER validate_application BEFORE INSERT OR UPDATE ON applications "
        "FOR EACH ROW EXECUTE FUNCTION m12_validate_application()"
    )
    op.execute(
        """
        CREATE FUNCTION m12_validate_assignee() RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
          IF NEW.assigned_staff_profile_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM role_profiles WHERE id = NEW.assigned_staff_profile_id
              AND tenant_id = NEW.tenant_id AND kind = 'staff'
          ) THEN
            RAISE EXCEPTION 'Invalid staff assignee' USING ERRCODE = '23503';
          END IF;
          RETURN NEW;
        END;
        $function$;
        """
    )
    op.execute(
        "CREATE TRIGGER validate_assignee BEFORE INSERT OR UPDATE ON enquiries "
        "FOR EACH ROW EXECUTE FUNCTION m12_validate_assignee()"
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
    op.execute("GRANT INSERT ON enquiries TO nexus_app")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.execute("DROP FUNCTION m12_validate_assignee()")
    op.execute("DROP FUNCTION m12_validate_application()")
    op.drop_index("uq_m12_class_group_ref", table_name="class_groups")
