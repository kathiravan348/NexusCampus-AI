"""Privacy (NEX-052, M06, G-6): consents, data subject requests, the compliance packs each tenant follows.

Revision ID: 0009_privacy
Revises: 0008_access_grants
Create Date: 2026-11-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_privacy"
down_revision: str | None = "0008_access_grants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
PACKS = "('gdpr', 'uk_gdpr', 'ferpa', 'coppa', 'dpdp', 'lgpd', 'popia', 'pdpa', 'eu_ai_act')"


def _tenant_table(name: str, grants: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {name} "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute(f"GRANT {grants} ON {name} TO nexus_app")


def upgrade() -> None:
    op.create_table(
        "consents",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("person_id", sa.String(ID), sa.ForeignKey("people.id"), nullable=False, index=True),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("given_by_person_id", sa.String(ID), sa.ForeignKey("people.id"), nullable=True),
        sa.Column("method", sa.String(32), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "purpose IN ('ai_features', 'media_sharing', 'marketing', 'data_processing')", name="purpose_known"
        ),
        sa.CheckConstraint("status IN ('granted', 'withdrawn', 'pending')", name="status_known"),
        sa.CheckConstraint("method IN ('form', 'digital_signature', 'in_app', 'paper')", name="method_known"),
        sa.CheckConstraint("(withdrawn_at IS NULL) = (status <> 'withdrawn')", name="withdrawn_at_when_withdrawn"),
        sa.CheckConstraint("withdrawn_at IS NULL OR withdrawn_at >= recorded_at", name="withdrawn_after_recorded"),
    )
    _tenant_table("consents", "SELECT, INSERT, UPDATE")

    op.create_table(
        "data_subject_requests",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("person_id", sa.String(ID), sa.ForeignKey("people.id"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handled_by", sa.String(ID), sa.ForeignKey("users.id"), nullable=True),
        #: Why a request was rejected (told to the requester); never written to the audit log.
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.CheckConstraint("kind IN ('access', 'correct', 'delete', 'export')", name="kind_known"),
        sa.CheckConstraint("status IN ('received', 'in_progress', 'completed', 'rejected')", name="status_known"),
        sa.CheckConstraint("due_at > received_at", name="due_after_received"),
        sa.CheckConstraint(
            "(completed_at IS NULL) = (status IN ('received', 'in_progress'))", name="completed_at_when_closed"
        ),
        sa.CheckConstraint("completed_at IS NULL OR completed_at >= received_at", name="completed_after_received"),
        sa.CheckConstraint("rejection_reason IS NULL OR status = 'rejected'", name="reason_only_when_rejected"),
    )
    _tenant_table("data_subject_requests", "SELECT, INSERT, UPDATE")

    op.create_table(
        "tenant_compliance",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("pack_code", sa.String(16), primary_key=True),
        sa.CheckConstraint(f"pack_code IN {PACKS}", name="pack_known"),
    )
    # Which packs apply is set when the tenant is provisioned (Nexus Control); the app only reads it.
    _tenant_table("tenant_compliance", "SELECT")


def downgrade() -> None:
    op.drop_table("tenant_compliance")
    op.drop_table("data_subject_requests")
    op.drop_table("consents")
