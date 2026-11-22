"""P14 compliance & trust: sub_processors, certifications, security_incidents, dpa_records (NEX-126).

`control_app`: SELECT only on all four tables (D23).

Revision ID: c0013_trust
Revises: c0012_partners_analytics
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0013_trust"
down_revision: str | None = "c0012_partners_analytics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION control_text_array_unique(arr text[]) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT AS $$
            SELECT cardinality(arr) = (SELECT count(DISTINCT v) FROM unnest(arr) AS v)
        $$
        """
    )
    op.create_table(
        "sub_processors",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("purpose", sa.String(300), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("dpa_signed", sa.Boolean(), nullable=False),
        sa.Column("touches_institution_data", sa.Boolean(), nullable=False),
        sa.CheckConstraint("length(btrim(name)) >= 1", name="sub_processors_name_non_empty"),
        sa.CheckConstraint("length(btrim(purpose)) >= 1", name="sub_processors_purpose_non_empty"),
        sa.CheckConstraint("country ~ '^[A-Z]{2}$'", name="sub_processors_country_iso"),
    )
    op.create_table(
        "certifications",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("code", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.CheckConstraint("code IN ('iso27001', 'iso27701', 'soc2', 'cert_in')", name="certifications_code_known"),
        sa.CheckConstraint(
            "status IN ('planned', 'in_audit', 'certified', 'lapsed')", name="certifications_status_known"
        ),
        sa.CheckConstraint(
            "(status = 'certified') = (valid_until IS NOT NULL)", name="certifications_valid_until_matches_status"
        ),
    )
    op.create_table(
        "security_incidents",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("severity", sa.String(8), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("affected_account_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("personal_data_affected", sa.Boolean(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("breach_notification_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("report_ai_drafted", sa.Boolean(), nullable=False),
        sa.CheckConstraint("length(btrim(title)) >= 1", name="incidents_title_non_empty"),
        sa.CheckConstraint("severity IN ('sev1', 'sev2', 'sev3', 'sev4')", name="incidents_severity_known"),
        sa.CheckConstraint(
            "status IN ('investigating', 'contained', 'resolved', 'post_mortem_done')", name="incidents_status_known"
        ),
        sa.CheckConstraint("control_text_array_unique(affected_account_ids)", name="incidents_affected_unique"),
        sa.CheckConstraint(
            "personal_data_affected = (breach_notification_due_at IS NOT NULL)",
            name="incidents_due_at_matches_personal_data",
        ),
        sa.CheckConstraint(
            "breach_notification_due_at IS NULL OR breach_notification_due_at >= detected_at",
            name="incidents_due_at_not_before_detected",
        ),
        sa.CheckConstraint("notified_at IS NULL OR personal_data_affected", name="incidents_notified_only_for_breach"),
    )
    op.create_table(
        "dpa_records",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version ~ '^[0-9]+\\.[0-9]+$'", name="dpa_records_version_format"),
    )

    op.execute(f"GRANT SELECT ON sub_processors, certifications, security_incidents, dpa_records TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("dpa_records")
    op.drop_table("security_incidents")
    op.drop_table("certifications")
    op.drop_table("sub_processors")
    op.execute("DROP FUNCTION IF EXISTS control_text_array_unique(text[])")
