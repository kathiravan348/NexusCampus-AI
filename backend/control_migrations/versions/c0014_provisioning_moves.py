"""P04 provisioning, offboarding & shred certificates, P18 portability moves (NEX-121).

`control_app`: SELECT only on all four tables (D23).

Revision ID: c0014_provisioning_moves
Revises: c0013_trust
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0014_provisioning_moves"
down_revision: str | None = "c0013_trust"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
_CODE_RE = r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$"
_SIG_RE = r"^[A-Za-z0-9+/]{86}==$"
_REGIONS = "('in', 'eu', 'us', 'me', 'apac')"
_INST_TYPES = "('ey', 'k12', 'he', 'voc', 'tp', 'sk', 'onl', 'grp')"
_JOB_STATUSES = "('pending', 'running', 'done', 'failed')"


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION control_job_steps_valid(
            steps jsonb, expected text[], job_status text
        ) RETURNS boolean
        LANGUAGE sql IMMUTABLE STRICT AS $$
            SELECT
                jsonb_typeof(steps) = 'array'
                AND jsonb_array_length(steps) = cardinality(expected)
                AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(steps) WITH ORDINALITY AS t(el, ord)
                    WHERE el->>'name' IS DISTINCT FROM expected[ord]
                       OR el->>'status' NOT IN ('pending', 'running', 'done', 'failed')
                )
                AND CASE
                    WHEN job_status = 'done' THEN
                        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(steps) AS t(el) WHERE el->>'status' <> 'done')
                    WHEN job_status = 'failed' THEN
                        EXISTS (SELECT 1 FROM jsonb_array_elements(steps) AS t(el) WHERE el->>'status' = 'failed')
                    ELSE
                        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(steps) AS t(el) WHERE el->>'status' = 'failed')
                        AND EXISTS (SELECT 1 FROM jsonb_array_elements(steps) AS t(el) WHERE el->>'status' <> 'done')
                END
        $$
        """
    )
    op.create_table(
        "provisioning_jobs",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("request_account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("request_region", sa.String(8), nullable=False),
        sa.Column("request_institution_type", sa.String(8), nullable=False),
        sa.Column("request_plan_code", sa.String(128), nullable=False),
        sa.Column("request_trial_days", sa.SmallInteger(), nullable=True),
        sa.Column("request_delivery_model", sa.String(16), nullable=False),
        sa.Column("steps", JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("tenant_id", sa.String(ID), nullable=True),
        sa.Column("requested_by_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"request_region IN {_REGIONS}", name="prov_request_region_known"),
        sa.CheckConstraint(f"request_institution_type IN {_INST_TYPES}", name="prov_request_inst_type_known"),
        sa.CheckConstraint(f"request_plan_code ~ '{_CODE_RE}'", name="prov_request_plan_code_format"),
        sa.CheckConstraint(
            "request_trial_days IS NULL OR request_trial_days BETWEEN 1 AND 60", name="prov_request_trial_days_range"
        ),
        sa.CheckConstraint(
            "request_delivery_model IN ('saas_shared', 'saas_dedicated')", name="prov_request_delivery_model_known"
        ),
        sa.CheckConstraint(f"status IN {_JOB_STATUSES}", name="prov_status_known"),
        sa.CheckConstraint(
            "control_job_steps_valid(steps, "
            "ARRAY['create_tenant', 'create_keys', 'apply_profile', 'seed', 'invite_owner'], status)",
            name="prov_steps_and_status_valid",
        ),
        sa.CheckConstraint("(steps->0->>'status' = 'done') = (tenant_id IS NOT NULL)", name="prov_tenant_id_rule"),
    )
    op.create_table(
        "offboarding_jobs",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False),
        sa.Column("steps", JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("shred_certificate_id", sa.String(ID), nullable=True),
        sa.Column("requested_by_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"status IN {_JOB_STATUSES}", name="offb_status_known"),
        sa.CheckConstraint(
            "control_job_steps_valid(steps, "
            "ARRAY['freeze_writes', 'export_ready', 'export_downloaded', "
            "'keys_destroyed', 'certificate_issued'], status)",
            name="offb_steps_and_status_valid",
        ),
        sa.CheckConstraint(
            "(steps->4->>'status' = 'done') = (shred_certificate_id IS NOT NULL)", name="offb_shred_cert_rule"
        ),
    )
    op.create_table(
        "shred_certificates",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False, index=True),
        sa.Column("key_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("destroyed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("signing_key_id", sa.String(64), nullable=False),
        sa.Column("signature", sa.String(88), nullable=False),
        sa.CheckConstraint("cardinality(key_ids) >= 1", name="shred_cert_key_ids_non_empty"),
        sa.CheckConstraint("length(btrim(signing_key_id)) >= 1", name="shred_cert_signing_key_non_empty"),
        sa.CheckConstraint(f"length(signature) = 88 AND signature ~ '{_SIG_RE}'", name="shred_cert_signature_ed25519"),
    )
    op.create_table(
        "portability_jobs",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.String(ID), nullable=False),
        sa.Column("direction", sa.String(24), nullable=False),
        sa.Column("from_region", sa.String(8), nullable=False),
        sa.Column("to_region", sa.String(8), nullable=False),
        sa.Column("steps", JSONB, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("encrypted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "direction IN ('saas_to_self_hosted', 'self_hosted_to_saas', 'region_move')", name="port_direction_known"
        ),
        sa.CheckConstraint(f"from_region IN {_REGIONS}", name="port_from_region_known"),
        sa.CheckConstraint(f"to_region IN {_REGIONS}", name="port_to_region_known"),
        sa.CheckConstraint("direction <> 'region_move' OR from_region <> to_region", name="port_region_move_diff"),
        sa.CheckConstraint(f"status IN {_JOB_STATUSES}", name="port_status_known"),
        sa.CheckConstraint("encrypted = true", name="port_encrypted_true"),
        sa.CheckConstraint(
            "control_job_steps_valid(steps, "
            "ARRAY['preflight', 'export_encrypted', 'transfer', 'import', "
            "'verify', 'cutover', 'shred_source'], status)",
            name="port_steps_and_status_valid",
        ),
    )

    op.execute(
        "GRANT SELECT ON provisioning_jobs, offboarding_jobs, "
        f"shred_certificates, portability_jobs TO {CONTROL_APP_ROLE}"
    )


def downgrade() -> None:
    op.drop_table("portability_jobs")
    op.drop_table("shred_certificates")
    op.drop_table("offboarding_jobs")
    op.drop_table("provisioning_jobs")
    op.execute("DROP FUNCTION IF EXISTS control_job_steps_valid(jsonb, text[], text)")
