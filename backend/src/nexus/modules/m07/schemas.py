"""M07 API models: `NotificationTemplate`, `NotificationDelivery`, `NotificationPreference`
(`contracts/src/notification.ts`) and the mock's inputs and preferences response (`handlers/m07.ts`)."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from nexus.core.schemas import Contract

Channel = Literal["email", "sms", "whatsapp", "push", "in_app"]
CHANNELS: tuple[Channel, ...] = ("email", "sms", "whatsapp", "push", "in_app")
TimeOfDay = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
EventType = Annotated[str, StringConstraints(pattern=r"^[mp]\d{2}(\.[a-z][a-zA-Z0-9]*){2,}$")]
Subject = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]


class TemplateOut(Contract):
    id: str
    tenant_id: str
    event_type: str
    channel: Channel
    locale: str
    subject: str | None
    body: str
    version: int
    enabled: bool
    updated_at: datetime


class DeliveryOut(Contract):
    id: str
    tenant_id: str
    template_id: str
    recipient_person_id: str
    channel: Channel
    status: Literal["queued", "sent", "delivered", "failed", "suppressed"]
    reason: str | None
    queued_at: datetime
    sent_at: datetime | None


class QuietHours(Contract):
    start: TimeOfDay
    end: TimeOfDay


class PreferenceOut(Contract):
    user_id: str
    channel: Channel
    event_type: str | None
    enabled: bool
    quiet_hours: QuietHours | None
    time_zone: str


class ChannelAvailability(Contract):
    channel: Channel
    available: bool


class PreferencesOut(Contract):
    preferences: list[PreferenceOut]
    channels: list[ChannelAvailability]


class ChannelSwitch(Contract):
    channel: Channel
    enabled: bool


class PreferencesIn(Contract):
    channels: list[ChannelSwitch]
    quiet_hours: QuietHours | None


class TemplateIn(Contract):
    subject: Subject | None
    body: Body
    enabled: bool


class NewTemplateIn(TemplateIn):
    event_type: EventType = Field(min_length=1)
    channel: Channel
    locale: str
