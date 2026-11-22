"""Store each release's signed manifest (`nexus-release/1`) on Control for M84 online update checks (NEX-117).

`signed_manifest` is internal (never returned by `GET /releases`); `control_app` keeps SELECT only.

Revision ID: c0008_release_manifests
Revises: c0007_releases
Create Date: 2026-11-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c0008_release_manifests"
down_revision: str | None = "c0007_releases"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("releases", sa.Column("signed_manifest", sa.Text(), nullable=True))
    op.create_check_constraint(
        "releases_signed_manifest_requires_signed",
        "releases",
        "signed_manifest IS NULL OR signed",
    )


def downgrade() -> None:
    op.drop_constraint("releases_signed_manifest_requires_signed", "releases", type_="check")
    op.drop_column("releases", "signed_manifest")
