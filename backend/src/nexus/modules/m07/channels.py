"""Delivery channels (NEX-056, G-7). Stage 1 has no real providers (email / SMS / WhatsApp / push come in Stage 2 by
decision): `LogChannel` accepts every message and records it in memory for tests and dev; it logs only ids and
sizes, never the text (it can hold personal data). `in_app` messages count as delivered at once; push has no
provider yet and fails.
"""

import logging
from dataclasses import dataclass, field
from typing import Literal, Protocol

log = logging.getLogger("nexus.notify")


@dataclass(frozen=True)
class OutgoingMessage:
    tenant_id: str
    recipient_person_id: str
    channel: str
    locale: str
    template_id: str
    subject: str | None
    body: str


@dataclass(frozen=True)
class SendResult:
    """A channel returns sent / delivered / failed; the dispatcher itself decides `suppressed`."""

    status: Literal["sent", "delivered", "failed", "suppressed"]
    reason: str | None = None


class Channel(Protocol):
    async def send(self, message: OutgoingMessage) -> SendResult: ...


@dataclass
class LogChannel:
    """Dev / test adapter: keeps every message (newest last) and reports success."""

    sent: list[OutgoingMessage] = field(default_factory=list)

    async def send(self, message: OutgoingMessage) -> SendResult:
        self.sent.append(message)
        log.info(
            "notify %s to %s via %s (template %s, %d chars)",
            message.tenant_id,
            message.recipient_person_id,
            message.channel,
            message.template_id,
            len(message.body),
        )
        return SendResult("delivered" if message.channel == "in_app" else "sent")


@dataclass
class Unavailable:
    reason: str

    async def send(self, message: OutgoingMessage) -> SendResult:
        return SendResult("failed", self.reason)


def dev_channels(log_channel: LogChannel | None = None) -> dict[str, Channel]:
    sink = log_channel or LogChannel()
    return {
        "email": sink,
        "sms": sink,
        "whatsapp": sink,
        "in_app": sink,
        "push": Unavailable("No push provider is set up"),
    }
