"""Signed Lago billing webhooks into Control's invoice list (NEX-111, P03, D51).

`POST /control/api/v1/billing/lago-webhook` accepts neither staff cookies nor dev headers. It authenticates solely
via Lago's base64 HMAC-SHA256 `X-Lago-Signature` over the raw body (≤ 256 KB) using `NEXUS_CONTROL_LAGO_WEBHOOK_KEY`,
deduplicates by the raw body's SHA-256 in `billing_webhook_events`, and logs event kind and ids only (V-7).
"""

import base64
import hashlib
import hmac
import json
import logging
import re
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import ValidationError
from sqlalchemy import CHAR, Column, DateTime, String, Table, func, select, text
from sqlalchemy.ext.asyncio import AsyncConnection

from nexus.control.accounts import accounts
from nexus.control.commercial import Invoice, InvoiceLine
from nexus.control.resources import engine_of
from nexus.control.staff import metadata
from nexus.core.errors import ApiError

MAX_WEBHOOK_BYTES = 256 * 1024
log = logging.getLogger("nexus.control.billing.webhooks")

EU_COUNTRIES = frozenset(
    {"AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU"}
    | {"IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"}
)

billing_webhook_events = Table(
    "billing_webhook_events",
    metadata,
    Column("id", CHAR(64), primary_key=True),
    Column("received_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("kind", String(64), nullable=False),
)

router = APIRouter(prefix="/control/api/v1", tags=["P03 billing webhooks"])


def tax_scheme_for(country: str) -> Literal["gst", "vat", "none"]:
    code = country.upper()
    if code == "IN":
        return "gst"
    if code == "GB" or code in EU_COUNTRIES:
        return "vat"
    return "none"


def sign_webhook(raw: bytes, key: str) -> str:
    """Computes Lago's `X-Lago-Signature` header value (base64 HMAC-SHA256 of raw body)."""
    digest = hmac.new(key.encode("utf-8"), raw, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def verify_signature(raw: bytes, signature: str, key: str) -> bool:
    if not key or not signature:
        return False
    return hmac.compare_digest(sign_webhook(raw, key), signature)


def _invoice_id_for(lago_id: str) -> str:
    hex_chars = re.sub(r"[^0-9a-f]", "", lago_id.lower())
    suffix = hex_chars[:12] if len(hex_chars) >= 12 else hashlib.sha256(lago_id.encode("utf-8")).hexdigest()[:12]
    return f"inv-{suffix}"


async def _read_bounded(request: Request, limit: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > limit:
                raise ApiError(413, "invalid_request", f"Webhook body exceeds {limit} bytes.")
        except ValueError:
            pass
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise ApiError(413, "invalid_request", f"Webhook body exceeds {limit} bytes.")
    return bytes(buf)


def _int_field(data: dict[str, Any], name: str) -> int:
    val = data.get(name)
    if isinstance(val, bool) or not isinstance(val, int):
        raise ApiError(422, "invalid_request", f"Invalid integer field {name}.")
    return val


def _parse_lines(raw_fees: Any, fallback_amount: int) -> list[InvoiceLine]:
    if raw_fees is not None and not isinstance(raw_fees, list):
        raise ApiError(422, "invalid_request", "Invalid invoice fees.")
    lines: list[InvoiceLine] = []
    for fee in raw_fees or []:
        if not isinstance(fee, dict):
            raise ApiError(422, "invalid_request", "Invalid invoice fee entry.")
        raw_item = fee.get("item")
        item: dict[str, Any] = raw_item if isinstance(raw_item, dict) else {}
        desc = (
            str(item.get("invoice_display_name") or item.get("name") or fee.get("description") or "").strip()[:200]
            or "Subscription charge"
        )
        try:
            units = max(1, int(Decimal(str(fee.get("units") or "1"))))
        except (InvalidOperation, ValueError) as exc:
            raise ApiError(422, "invalid_request", "Invalid fee units.") from exc
        amount = _int_field(fee, "amount_cents")
        lines.append(InvoiceLine(description=desc, item_id=None, quantity=units, amount_minor=amount))
    if not lines:
        lines.append(InvoiceLine(description="Subscription", item_id=None, quantity=1, amount_minor=fallback_amount))
    return lines


async def _handle_invoice_created(conn: AsyncConnection, payload: dict[str, Any]) -> str:
    inv = payload.get("invoice")
    if not isinstance(inv, dict):
        raise ApiError(422, "invalid_request", "Missing invoice object.")
    lago_id = str(inv.get("lago_id") or "").strip()
    if not lago_id:
        raise ApiError(422, "invalid_request", "Missing lago_id.")
    if inv.get("status") != "finalized":
        log.info("lago webhook kind=invoice.created lago_id=%s outcome=ignored_draft", lago_id)
        return "ignored"

    customer = inv.get("customer")
    account_id = str(customer.get("external_id") or "").strip() if isinstance(customer, dict) else ""
    account = (await conn.execute(select(accounts.c.id, accounts.c.country).where(accounts.c.id == account_id))).first()
    if account is None:
        log.warning("lago webhook kind=invoice.created lago_id=%s outcome=unknown_account", lago_id)
        raise ApiError(422, "invalid_request", "Unknown Control account.")

    existing = (
        await conn.execute(text("SELECT id FROM invoices WHERE lago_invoice_id = :lid"), {"lid": lago_id})
    ).first()
    if existing is not None:
        log.info("lago webhook kind=invoice.created lago_id=%s invoice_id=%s outcome=duplicate", lago_id, existing.id)
        return "duplicate"

    try:
        issue_date = date.fromisoformat(str(inv.get("issuing_date") or ""))
        due_date = date.fromisoformat(str(inv.get("payment_due_date") or inv.get("issuing_date") or ""))
    except ValueError as exc:
        raise ApiError(422, "invalid_request", "Invalid invoice date.") from exc
    if due_date < issue_date:
        raise ApiError(422, "invalid_request", "Invoice due date precedes issue date.")

    subtotal = _int_field(inv, "sub_total_excluding_taxes_amount_cents")
    tax = _int_field(inv, "taxes_amount_cents")
    total = _int_field(inv, "total_amount_cents")
    if tax < 0 or subtotal + tax != total:
        raise ApiError(422, "invalid_request", "Invoice amounts do not add up.")

    currency = str(inv.get("currency") or "").upper()
    lines = _parse_lines(inv.get("fees"), subtotal)
    seq = int((await conn.execute(text("SELECT nextval('invoice_number_seq')"))).scalar_one())
    inv_id = _invoice_id_for(lago_id)
    number = f"INV-{issue_date.year}-{seq:06d}"
    tax_scheme = tax_scheme_for(str(account.country))
    # A payment can be settled before `invoice.created` arrives (or its update was lost): honour it here.
    paid_at = datetime.now(UTC).replace(microsecond=0) if inv.get("payment_status") == "succeeded" else None

    try:
        model = Invoice(
            id=inv_id,
            account_id=str(account.id),
            number=number,
            status="paid" if paid_at else "open",
            issue_date=issue_date.isoformat(),
            due_date=due_date.isoformat(),
            currency=currency,
            tax_scheme=tax_scheme,
            lines=lines,
            subtotal_minor=subtotal,
            tax_minor=tax,
            total_minor=total,
            paid_at=paid_at.isoformat().replace("+00:00", "Z") if paid_at else None,
        )
    except ValidationError as exc:
        raise ApiError(422, "invalid_request", "Invoice payload does not match contract.") from exc

    lines_json = json.dumps([line.model_dump(by_alias=True) for line in model.lines])
    await conn.execute(
        text(
            "INSERT INTO invoices"
            " (id, account_id, number, status, issue_date, due_date, currency, tax_scheme,"
            "  lines, subtotal_minor, tax_minor, total_minor, paid_at, lago_invoice_id)"
            " VALUES (:id, :acc, :num, :status, :iss, :due, :cur, :tax_scheme,"
            "  CAST(:lines AS jsonb), :sub, :tax, :tot, :paid_at, :lid)"
            " ON CONFLICT (lago_invoice_id) DO NOTHING"
        ),
        {
            "id": model.id,
            "acc": model.account_id,
            "num": model.number,
            "status": model.status,
            "paid_at": paid_at,
            "iss": issue_date,
            "due": due_date,
            "cur": model.currency,
            "tax_scheme": model.tax_scheme,
            "lines": lines_json,
            "sub": model.subtotal_minor,
            "tax": model.tax_minor,
            "tot": model.total_minor,
            "lid": lago_id,
        },
    )
    log.info(
        "lago webhook kind=invoice.created lago_id=%s invoice_id=%s account_id=%s status=%s outcome=created",
        lago_id,
        model.id,
        model.account_id,
        model.status,
    )
    return "created"


async def _handle_payment_status_updated(conn: AsyncConnection, payload: dict[str, Any]) -> str:
    inv = payload.get("invoice")
    if not isinstance(inv, dict):
        raise ApiError(422, "invalid_request", "Missing invoice object.")
    lago_id = str(inv.get("lago_id") or "").strip()
    if not lago_id:
        raise ApiError(422, "invalid_request", "Missing lago_id.")
    payment_status = str(inv.get("payment_status") or "")
    if payment_status != "succeeded":
        log.info(
            "lago webhook kind=invoice.payment_status_updated lago_id=%s payment_status=%s outcome=unchanged",
            lago_id,
            payment_status,
        )
        return "unchanged"
    paid_at = datetime.now(UTC).replace(microsecond=0)
    res = await conn.execute(
        text(
            "UPDATE invoices SET status = 'paid', paid_at = :paid_at WHERE lago_invoice_id = :lid AND status <> 'paid'"
        ),
        {"paid_at": paid_at, "lid": lago_id},
    )
    log.info(
        "lago webhook kind=invoice.payment_status_updated lago_id=%s outcome=paid updated=%d",
        lago_id,
        res.rowcount,
    )
    return "paid"


@router.post("/billing/lago-webhook")
async def lago_webhook(request: Request) -> dict[str, str]:
    """Receives Lago webhooks signed with `X-Lago-Signature` (HMAC-SHA256); no cookie or staff header."""
    raw = await _read_bounded(request, MAX_WEBHOOK_BYTES)
    key = request.app.state.settings.lago_webhook_key.get_secret_value().strip()
    sig = (request.headers.get("x-lago-signature") or "").strip()
    if not verify_signature(raw, sig, key):
        log.info("lago webhook outcome=unauthorized")
        raise ApiError(401, "unauthorized", "Invalid webhook signature.")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ApiError(422, "invalid_request", "Webhook body is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise ApiError(422, "invalid_request", "Webhook body must be a JSON object.")

    kind = str(payload.get("webhook_type") or "unknown")[:64]
    body_hash = hashlib.sha256(raw).hexdigest()

    async with engine_of(request).begin() as conn:
        inserted = (
            await conn.execute(
                text(
                    "INSERT INTO billing_webhook_events (id, kind)"
                    " VALUES (:id, :kind) ON CONFLICT (id) DO NOTHING RETURNING id"
                ),
                {"id": body_hash, "kind": kind},
            )
        ).first()
        if inserted is None:
            log.info("lago webhook kind=%s outcome=duplicate", kind)
            return {"status": "duplicate"}

        if kind == "invoice.created":
            outcome = await _handle_invoice_created(conn, payload)
        elif kind == "invoice.payment_status_updated":
            outcome = await _handle_payment_status_updated(conn, payload)
        else:
            log.info("lago webhook kind=%s outcome=ignored", kind)
            outcome = "ignored"
    return {"status": outcome}
