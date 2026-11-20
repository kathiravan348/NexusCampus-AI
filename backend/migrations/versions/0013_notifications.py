"""Notifications (NEX-056, M07, G-1): templates, deliveries, preferences, idempotency keys; outbox retry columns.

The outbox worker runs as `nexus_app` under RLS, one tenant transaction at a time. To find work it calls
`nexus_outbox_tenants()` (SECURITY DEFINER, owner-owned): it returns only the ids of tenants with due events —
never event data — so the worker needs no cross-tenant read access.

Revision ID: 0013_notifications
Revises: 0012_plans_usage
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_notifications"
down_revision: str | None = "0012_plans_usage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ID = 128
CHANNELS = "('email', 'sms', 'whatsapp', 'push', 'in_app')"


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
    op.create_table(
        "notification_templates",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("locale", sa.String(35), nullable=False),
        sa.Column("subject", sa.String(300), nullable=True),
        sa.Column("body", sa.String(10000), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("tenant_id", "event_type", "channel", "locale", name="one_per_event_channel_locale"),
        sa.CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        sa.CheckConstraint("(subject IS NOT NULL) = (channel = 'email')", name="subject_only_for_email"),
        sa.CheckConstraint("version >= 1", name="version_positive"),
    )
    _rls("notification_templates", "SELECT, INSERT, UPDATE")

    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("template_id", sa.String(ID), sa.ForeignKey("notification_templates.id"), nullable=False),
        sa.Column("recipient_person_id", sa.String(ID), sa.ForeignKey("people.id"), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        #: The outbox event that caused it (NULL for seeded history); one delivery per event + person + channel.
        sa.Column("event_id", sa.String(ID), nullable=True),
        sa.UniqueConstraint("event_id", "recipient_person_id", "channel", name="once_per_event_recipient_channel"),
        sa.CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        sa.CheckConstraint("status IN ('queued', 'sent', 'delivered', 'failed', 'suppressed')", name="status_known"),
        sa.CheckConstraint("(reason IS NOT NULL) = (status IN ('failed', 'suppressed'))", name="reason_when_not_sent"),
        sa.CheckConstraint("sent_at IS NULL OR sent_at >= queued_at", name="sent_after_queued"),
        sa.CheckConstraint("(sent_at IS NOT NULL) OR status NOT IN ('sent', 'delivered')", name="sent_needs_sent_at"),
        sa.CheckConstraint("sent_at IS NULL OR status NOT IN ('queued', 'suppressed')", name="unsent_has_no_sent_at"),
    )
    _rls("notification_deliveries", "SELECT, INSERT, UPDATE")

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.String(ID), primary_key=True),
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("user_id", sa.String(ID), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("event_type", sa.String(120), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("quiet_start", sa.String(5), nullable=True),
        sa.Column("quiet_end", sa.String(5), nullable=True),
        sa.Column("time_zone", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "user_id", "channel", "event_type", name="one_per_user_channel_event", postgresql_nulls_not_distinct=True
        ),
        sa.CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        sa.CheckConstraint("(quiet_start IS NULL) = (quiet_end IS NULL)", name="quiet_hours_complete"),
        sa.CheckConstraint("quiet_start IS NULL OR quiet_start <> quiet_end", name="quiet_hours_differ"),
    )
    _rls("notification_preferences", "SELECT, INSERT, UPDATE, DELETE")

    op.create_table(
        "idempotency_keys",
        sa.Column("tenant_id", sa.String(ID), sa.ForeignKey("tenants.id"), primary_key=True),
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("user_id", sa.String(ID), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    _rls("idempotency_keys", "SELECT, INSERT")

    op.add_column("domain_events_outbox", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("domain_events_outbox", sa.Column("last_error", sa.String(500), nullable=True))
    op.execute(
        "CREATE FUNCTION nexus_outbox_tenants() RETURNS SETOF varchar LANGUAGE sql STABLE SECURITY DEFINER "
        "SET search_path = public AS $$ SELECT DISTINCT tenant_id FROM domain_events_outbox "
        "WHERE published_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= now()) $$"
    )
    op.execute("REVOKE ALL ON FUNCTION nexus_outbox_tenants() FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION nexus_outbox_tenants() TO nexus_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION nexus_outbox_tenants()")
    op.drop_column("domain_events_outbox", "last_error")
    op.drop_column("domain_events_outbox", "next_attempt_at")
    op.drop_table("idempotency_keys")
    op.drop_table("notification_preferences")
    op.drop_table("notification_deliveries")
    op.drop_table("notification_templates")
