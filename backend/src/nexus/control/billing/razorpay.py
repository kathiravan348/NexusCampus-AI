"""Razorpay Payment Links adapter and webhook signature verifier (P03, D62, NEX-107).

Talks strictly to `https://api.razorpay.com/v1` (TLS verified, 10 s timeout, no redirects). Keys are passed only in
HTTP Basic Auth and never logged or included in error messages.
"""

import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any, Literal

import httpx2

from nexus.control.billing.payments import LinkStatus, PaymentGatewayError, PaymentLink, PaymentLinkRequest

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"
RAZORPAY_TIMEOUT_SECONDS = 10.0

_STATUS_MAP: dict[str, LinkStatus] = {
    "created": "created",
    "partially_paid": "created",
    "paid": "paid",
    "expired": "expired",
    "cancelled": "cancelled",
}


def build_payment_link_payload(req: PaymentLinkRequest) -> dict[str, Any]:
    """Builds the Razorpay Payment Links v1 request body (INR, no partials, card/UPI/netbanking only)."""
    if req.currency.upper() != "INR":
        raise PaymentGatewayError("Razorpay links only support INR")
    payload: dict[str, Any] = {
        "amount": req.amount_minor,
        "currency": "INR",
        "accept_partial": False,
        "reference_id": req.invoice_id,
        "description": req.invoice_number,
        "expire_by": int(req.expire_by.astimezone(UTC).timestamp()),
        "options": {
            "checkout": {
                "method": {
                    "card": True,
                    "upi": True,
                    "netbanking": True,
                    "wallet": False,
                    "emi": False,
                    "paylater": False,
                }
            }
        },
    }
    if req.customer_email:
        customer: dict[str, str] = {"email": req.customer_email}
        if req.customer_name:
            customer["name"] = req.customer_name
        payload["customer"] = customer
        payload["notify"] = {"email": True, "sms": False}
    else:
        payload["notify"] = {"email": False, "sms": False}
    return payload


def _parse_link(data: dict[str, Any], fallback_expires: datetime | None = None) -> PaymentLink:
    lid = str(data.get("id") or "").strip()
    url = str(data.get("short_url") or "").strip()
    if not lid or not url.startswith("https://"):
        raise PaymentGatewayError("invalid payment link response from Razorpay")
    raw_status = str(data.get("status") or "created").lower()
    status = _STATUS_MAP.get(raw_status, "created")
    exp_raw = data.get("expire_by")
    if isinstance(exp_raw, int) and not isinstance(exp_raw, bool) and exp_raw > 0:
        expires_at = datetime.fromtimestamp(exp_raw, tz=UTC)
    elif fallback_expires is not None:
        expires_at = fallback_expires.astimezone(UTC)
    else:
        raise PaymentGatewayError("missing expire_by in Razorpay response")
    return PaymentLink(
        gateway="razorpay",
        gateway_link_id=lid,
        short_url=url,
        status=status,
        expires_at=expires_at,
    )


class RazorpayGateway:
    """HTTP adapter for Razorpay Payment Links API v1."""

    def __init__(
        self,
        key_id: str,
        key_secret: str,
        *,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._auth = httpx2.BasicAuth(key_id, key_secret)
        self._transport = transport

    def _client(self) -> httpx2.AsyncClient:
        if self._transport is not None:
            return httpx2.AsyncClient(
                timeout=RAZORPAY_TIMEOUT_SECONDS,
                verify=True,
                follow_redirects=False,
                auth=self._auth,
                transport=self._transport,
            )
        return httpx2.AsyncClient(
            timeout=RAZORPAY_TIMEOUT_SECONDS,
            verify=True,
            follow_redirects=False,
            auth=self._auth,
        )

    async def create_link(self, req: PaymentLinkRequest) -> PaymentLink:
        payload = build_payment_link_payload(req)
        try:
            async with self._client() as client:
                res = await client.post(f"{RAZORPAY_API_BASE}/payment_links", json=payload)
        except httpx2.HTTPError as exc:
            raise PaymentGatewayError("Razorpay API unreachable") from exc
        if res.status_code < 200 or res.status_code >= 300:
            raise PaymentGatewayError(f"Razorpay rejected payment link creation ({res.status_code})")
        try:
            body = res.json()
        except ValueError as exc:
            raise PaymentGatewayError("Razorpay returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise PaymentGatewayError("Razorpay returned invalid JSON object")
        return _parse_link(body, req.expire_by)

    async def fetch_link(self, gateway_link_id: str) -> PaymentLink:
        try:
            async with self._client() as client:
                res = await client.get(f"{RAZORPAY_API_BASE}/payment_links/{gateway_link_id}")
        except httpx2.HTTPError as exc:
            raise PaymentGatewayError("Razorpay API unreachable") from exc
        if res.status_code < 200 or res.status_code >= 300:
            raise PaymentGatewayError(f"Razorpay rejected payment link fetch ({res.status_code})")
        try:
            body = res.json()
        except ValueError as exc:
            raise PaymentGatewayError("Razorpay returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise PaymentGatewayError("Razorpay returned invalid JSON object")
        return _parse_link(body)


def sign_razorpay_webhook(raw: bytes, secret: str) -> str:
    """Computes Razorpay's `X-Razorpay-Signature` header (hex HMAC-SHA256 of raw body)."""
    return hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()


def verify_razorpay_signature(raw: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    return hmac.compare_digest(sign_razorpay_webhook(raw, secret), signature.lower())


def map_razorpay_method(raw: str | None) -> Literal["card", "upi", "netbanking", "bank_transfer"]:
    m = (raw or "").strip().lower()
    if m == "upi":
        return "upi"
    if m == "netbanking":
        return "netbanking"
    if m == "bank_transfer":
        return "bank_transfer"
    return "card"
