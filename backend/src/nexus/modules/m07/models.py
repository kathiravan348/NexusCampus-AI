"""M07 tables and idempotency keys (migration `0013_notifications`); a test compares them with the database."""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, id_column

CHANNELS = "('email', 'sms', 'whatsapp', 'push', 'in_app')"


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "event_type", "channel", "locale", name="one_per_event_channel_locale"),
        CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        CheckConstraint("(subject IS NOT NULL) = (channel = 'email')", name="subject_only_for_email"),
        CheckConstraint("version >= 1", name="version_positive"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(120))
    channel: Mapped[str] = mapped_column(String(16))
    locale: Mapped[str] = mapped_column(String(35))
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(String(10000))
    version: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = (
        UniqueConstraint("event_id", "recipient_person_id", "channel", name="once_per_event_recipient_channel"),
        CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        CheckConstraint("status IN ('queued', 'sent', 'delivered', 'failed', 'suppressed')", name="status_known"),
        CheckConstraint("(reason IS NOT NULL) = (status IN ('failed', 'suppressed'))", name="reason_when_not_sent"),
        CheckConstraint("sent_at IS NULL OR sent_at >= queued_at", name="sent_after_queued"),
        CheckConstraint("(sent_at IS NOT NULL) OR status NOT IN ('sent', 'delivered')", name="sent_needs_sent_at"),
        CheckConstraint("sent_at IS NULL OR status NOT IN ('queued', 'suppressed')", name="unsent_has_no_sent_at"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    template_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("notification_templates.id"))
    recipient_person_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("people.id"))
    channel: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str | None] = mapped_column(String(500))
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    event_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "channel", "event_type", name="one_per_user_channel_event", postgresql_nulls_not_distinct=True
        ),
        CheckConstraint(f"channel IN {CHANNELS}", name="channel_known"),
        CheckConstraint("(quiet_start IS NULL) = (quiet_end IS NULL)", name="quiet_hours_complete"),
        CheckConstraint("quiet_start IS NULL OR quiet_start <> quiet_end", name="quiet_hours_differ"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    channel: Mapped[str] = mapped_column(String(16))
    event_type: Mapped[str | None] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean)
    quiet_start: Mapped[str | None] = mapped_column(String(5))
    quiet_end: Mapped[str | None] = mapped_column(String(5))
    time_zone: Mapped[str] = mapped_column(String(64))


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("users.id"))
    request_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
