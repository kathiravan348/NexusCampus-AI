"""AI (NEX-058, M11, A-1 to A-8, D47): settings, credits, an answer log without text, and tenant-isolated vector chunks.

`ai_chunks.embedding` is a pgvector column (PostgreSQL only, D47). Health (M61) and vault (M83) data can never be
stored as chunks (CHECK). The answer log keeps metadata only — never the question or the answer text.

Revision ID: 0015_ai
Revises: 0014_sync
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_ai"
down_revision: str | None = "0014_sync"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
DIMS = 1024
TIERS = "('fast', 'balanced', 'reasoning', 'embedding', 'multimodal')"


def _rls(name: str, grants: str) -> None:
    op.execute(f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON {name} "
        "USING (tenant_id = current_setting('app.tenant_id', true)) "
        "WITH CHECK (tenant_id = current_setting('app.tenant_id', true))"
    )
    op.execute(f"GRANT {grants} ON {name} TO nexus_app")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "ai_settings",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("modules", postgresql.JSONB(), nullable=False),
        sa.Column("blocked_modules", postgresql.ARRAY(sa.String(3)), nullable=False),
        sa.Column("safeguarding_enabled", sa.Boolean(), nullable=False),
        sa.Column("default_tier", sa.String(16), nullable=False),
        sa.Column("provider_kind", sa.String(8), nullable=False),
        sa.Column("provider_label", sa.String(200), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"default_tier IN {TIERS}", name="tier_known"),
        sa.CheckConstraint("provider_kind IN ('cloud', 'local')", name="provider_kind_known"),
        sa.CheckConstraint("blocked_modules @> ARRAY['M61', 'M83']::varchar[]", name="health_and_vault_blocked"),
    )
    _rls("ai_settings", "SELECT, INSERT, UPDATE")

    op.create_table(
        "ai_credits",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("period_start", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("granted", sa.Integer(), nullable=False),
        sa.Column("used", sa.Integer(), nullable=False),
        sa.Column("hard_cap", sa.Boolean(), nullable=False),
        sa.CheckConstraint("period_end > period_start", name="period_ordered"),
        sa.CheckConstraint("granted >= 0 AND used >= 0", name="counts_not_negative"),
        sa.CheckConstraint("NOT hard_cap OR used <= granted", name="hard_cap_holds"),
    )
    _rls("ai_credits", "SELECT, INSERT, UPDATE")

    op.create_table(
        "ai_answer_log",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("user_id", sa.String(ID), nullable=False),
        sa.Column("locale", sa.String(35), nullable=False),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("source_count", sa.Integer(), nullable=False),
        sa.Column("credits_used", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("outcome IN ('answered', 'no_source', 'refused')", name="outcome_known"),
    )
    _rls("ai_answer_log", "SELECT, INSERT")

    op.create_table(
        "ai_chunks",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("module_id", sa.String(3), nullable=False),
        sa.Column("record_type", sa.String(64), nullable=False),
        sa.Column("record_id", sa.String(ID), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("locale", sa.String(35), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.UniqueConstraint(
            "tenant_id", "module_id", "record_type", "record_id", "locale", name="one_chunk_per_record"
        ),
        sa.CheckConstraint("module_id NOT IN ('M61', 'M83')", name="never_health_or_vault"),
    )
    op.execute(f"ALTER TABLE ai_chunks ADD COLUMN embedding vector({DIMS}) NOT NULL")
    _rls("ai_chunks", "SELECT, INSERT, UPDATE, DELETE")


def downgrade() -> None:
    op.drop_table("ai_chunks")
    op.drop_table("ai_answer_log")
    op.drop_table("ai_credits")
    op.drop_table("ai_settings")
