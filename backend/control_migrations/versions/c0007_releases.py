"""P07 releases and staged rollouts (NEX-115). Read-only for `control_app` (publish/start stay in mocks here).

Revision ID: c0007_releases
Revises: c0006_fleet
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0007_releases"
down_revision: str | None = "c0006_fleet"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
_SEMVER_RE = r"^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"


def upgrade() -> None:
    op.create_table(
        "releases",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signed", sa.Boolean(), nullable=False),
        sa.Column("offline_bundle", sa.Boolean(), nullable=False),
        sa.Column("min_upgrade_from", sa.String(64), nullable=False),
        sa.Column("migration_notes", sa.String(5000), nullable=False),
        sa.Column("notes_ai_drafted", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("channel", "version", name="uq_releases_channel_version"),
        sa.CheckConstraint("channel IN ('stable', 'lts', 'preview')", name="releases_channel_known"),
        sa.CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="releases_status_known"),
        sa.CheckConstraint("(status = 'draft') = (published_at IS NULL)", name="releases_draft_no_published_at"),
        sa.CheckConstraint("status = 'draft' OR signed", name="releases_published_must_be_signed"),
        sa.CheckConstraint("channel <> 'preview' OR NOT offline_bundle", name="releases_preview_no_offline_bundle"),
        sa.CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="releases_version_semver"),
        sa.CheckConstraint(f"min_upgrade_from ~ '{_SEMVER_RE}'", name="releases_min_upgrade_semver"),
    )
    op.create_table(
        "rollouts",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("release_id", sa.String(ID), sa.ForeignKey("releases.id"), nullable=False, index=True),
        sa.Column("ring", sa.SmallInteger(), nullable=False),
        sa.Column("deployment_ids", ARRAY(sa.Text()), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("release_id", "ring", name="uq_rollouts_release_ring"),
        sa.CheckConstraint("ring >= 0 AND ring <= 3", name="rollouts_ring_range"),
        sa.CheckConstraint("cardinality(deployment_ids) >= 1", name="rollouts_deployments_non_empty"),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed', 'rolled_back')", name="rollouts_status_known"
        ),
        sa.CheckConstraint("(status = 'pending') = (started_at IS NULL)", name="rollouts_pending_no_started_at"),
    )

    op.execute(f"GRANT SELECT ON releases, rollouts TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("rollouts")
    op.drop_table("releases")
