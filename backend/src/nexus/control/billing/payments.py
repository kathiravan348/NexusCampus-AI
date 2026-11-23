"""Payment gateway protocol (`PaymentGateway`) and in-memory fake for tests (P03, D62, NEX-107).

Hosted payment pages only: no card, bank, or UPI credentials ever touch NexusCampus.
"""

import secrets
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol

GatewayKind = Literal["razorpay", "stripe"]
LinkStatus = Literal["created", "paid", "expired", "cancelled"]


class PaymentGatewayError(Exception):
    """The payment gateway rejected or could not complete the request (never carries secrets)."""


@dataclass(frozen=True)
class PaymentLinkRequest:
    invoice_id: str
    invoice_number: str
    amount_minor: int
    currency: str
    expire_by: datetime
    #: Billing contact name + e-mail only (the only personal data sent to the gateway, D62).
    customer_name: str | None = None
    customer_email: str | None = None


@dataclass(frozen=True)
class PaymentLink:
    gateway: GatewayKind
    gateway_link_id: str
    short_url: str
    status: LinkStatus
    expires_at: datetime


class PaymentGateway(Protocol):
    async def create_link(self, req: PaymentLinkRequest) -> PaymentLink: ...
    async def fetch_link(self, gateway_link_id: str) -> PaymentLink: ...


@dataclass
class FakePaymentGateway:
    """In-memory gateway for tests."""

    gateway: GatewayKind = "razorpay"
    links: dict[str, PaymentLink] = field(default_factory=dict)
    requests: list[PaymentLinkRequest] = field(default_factory=list)
    fail_next: bool = False

    async def create_link(self, req: PaymentLinkRequest) -> PaymentLink:
        self.requests.append(req)
        if self.fail_next:
            self.fail_next = False
            raise PaymentGatewayError("fake payment gateway unavailable")
        lid = f"plink_{secrets.token_hex(7)}"
        link = PaymentLink(
            gateway=self.gateway,
            gateway_link_id=lid,
            short_url=f"https://rzp.io/i/{lid[-8:]}",
            status="created",
            expires_at=req.expire_by,
        )
        self.links[lid] = link
        return link

    async def fetch_link(self, gateway_link_id: str) -> PaymentLink:
        link = self.links.get(gateway_link_id)
        if link is None:
            raise PaymentGatewayError("payment link not found")
        return link
