"""P09 support desk: tickets, ticket_replies, sla_policies, kb_articles (NEX-122).

`control_app`: SELECT on all four; INSERT on `ticket_replies`; UPDATE (`status`, `assignee_staff_id`, `resolved_at`)
on `tickets`; nothing else (D23).

Revision ID: c0010_support
Revises: c0009_lago_invoices
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

from nexus.control.settings import CONTROL_APP_ROLE

revision: str = "c0010_support"
down_revision: str | None = "c0009_lago_invoices"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 64
_DOC_NUM_RE = r"^[A-Z]{2,5}-[0-9]{4}-[0-9]{3,6}$"
_SLUG_RE = r"^[a-z0-9]+(-[a-z0-9]+)*$"
_SLA_FIRST_ORDER = (
    "(first_response_minutes->>'p1')::int >= 1 "
    "AND (first_response_minutes->>'p1')::int <= (first_response_minutes->>'p2')::int "
    "AND (first_response_minutes->>'p2')::int <= (first_response_minutes->>'p3')::int "
    "AND (first_response_minutes->>'p3')::int <= (first_response_minutes->>'p4')::int"
)
_SLA_RES_ORDER = (
    "(resolution_minutes->>'p1')::int >= 1 "
    "AND (resolution_minutes->>'p1')::int <= (resolution_minutes->>'p2')::int "
    "AND (resolution_minutes->>'p2')::int <= (resolution_minutes->>'p3')::int "
    "AND (resolution_minutes->>'p3')::int <= (resolution_minutes->>'p4')::int"
)
_SLA_FIRST_LE_RES = (
    "(first_response_minutes->>'p1')::int <= (resolution_minutes->>'p1')::int "
    "AND (first_response_minutes->>'p2')::int <= (resolution_minutes->>'p2')::int "
    "AND (first_response_minutes->>'p3')::int <= (resolution_minutes->>'p3')::int "
    "AND (first_response_minutes->>'p4')::int <= (resolution_minutes->>'p4')::int"
)


def upgrade() -> None:
    op.create_table(
        "tickets",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("number", sa.String(32), nullable=False, unique=True),
        sa.Column("account_id", sa.String(ID), sa.ForeignKey("accounts.id"), nullable=False, index=True),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("priority", sa.String(4), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("assignee_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=True, index=True),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("breached", sa.Boolean(), nullable=False),
        sa.Column("access_request_id", sa.String(ID), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(f"number ~ '{_DOC_NUM_RE}'", name="tickets_number_format"),
        sa.CheckConstraint("length(btrim(subject)) >= 1", name="tickets_subject_non_empty"),
        sa.CheckConstraint("priority IN ('p1', 'p2', 'p3', 'p4')", name="tickets_priority_known"),
        sa.CheckConstraint(
            "status IN ('new', 'open', 'waiting_customer', 'resolved', 'closed')", name="tickets_status_known"
        ),
        sa.CheckConstraint("channel IN ('portal', 'email', 'phone')", name="tickets_channel_known"),
        sa.CheckConstraint(
            "(status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL)", name="tickets_resolved_at_matches_status"
        ),
        sa.CheckConstraint("sla_due_at > created_at", name="tickets_sla_after_created"),
        sa.CheckConstraint("status = 'new' OR assignee_staff_id IS NOT NULL", name="tickets_assignee_past_new"),
    )
    op.create_table(
        "ticket_replies",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("ticket_id", sa.String(ID), sa.ForeignKey("tickets.id"), nullable=False, index=True),
        sa.Column("author_kind", sa.String(16), nullable=False),
        sa.Column("author_staff_id", sa.String(ID), sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("body", sa.String(5000), nullable=False),
        sa.Column("internal", sa.Boolean(), nullable=False),
        sa.Column("ai_drafted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("author_kind IN ('staff', 'customer')", name="ticket_replies_author_kind_known"),
        sa.CheckConstraint("length(btrim(body)) >= 1", name="ticket_replies_body_non_empty"),
        sa.CheckConstraint(
            "(author_kind = 'staff') = (author_staff_id IS NOT NULL)", name="ticket_replies_author_staff_matches_kind"
        ),
        sa.CheckConstraint(
            "author_kind = 'staff' OR (NOT internal AND NOT ai_drafted)", name="ticket_replies_customer_public_human"
        ),
    )
    op.create_table(
        "sla_policies",
        sa.Column("sla_tier", sa.String(16), primary_key=True),
        sa.Column("first_response_minutes", JSONB, nullable=False),
        sa.Column("resolution_minutes", JSONB, nullable=False),
        sa.Column("twenty_four_seven", sa.Boolean(), nullable=False),
        sa.CheckConstraint("sla_tier IN ('standard', 'priority', 'enterprise')", name="sla_policies_tier_known"),
        sa.CheckConstraint(_SLA_FIRST_ORDER, name="sla_policies_first_response_order"),
        sa.CheckConstraint(_SLA_RES_ORDER, name="sla_policies_resolution_order"),
        sa.CheckConstraint(_SLA_FIRST_LE_RES, name="sla_policies_first_before_resolution"),
    )
    op.create_table(
        "kb_articles",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("slug", sa.String(128), nullable=False),
        sa.Column("locale", sa.String(35), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("locale", "slug", name="uq_kb_articles_locale_slug"),
        sa.CheckConstraint(f"slug ~ '{_SLUG_RE}'", name="kb_articles_slug_format"),
        sa.CheckConstraint("length(btrim(title)) >= 1", name="kb_articles_title_non_empty"),
        sa.CheckConstraint("length(btrim(body)) BETWEEN 1 AND 20000", name="kb_articles_body_length"),
    )

    op.execute(f"GRANT SELECT ON tickets, ticket_replies, sla_policies, kb_articles TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT INSERT ON ticket_replies TO {CONTROL_APP_ROLE}")
    op.execute(f"GRANT UPDATE (status, assignee_staff_id, resolved_at) ON tickets TO {CONTROL_APP_ROLE}")


def downgrade() -> None:
    op.drop_table("kb_articles")
    op.drop_table("sla_policies")
    op.drop_table("ticket_replies")
    op.drop_table("tickets")
