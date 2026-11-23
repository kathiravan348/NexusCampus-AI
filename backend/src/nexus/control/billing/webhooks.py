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
import secrets
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import ValidationError
from sqlalchemy import CHAR, Column, DateTime, String, Table, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncConnection

from nexus.control.accounts import accounts
from nexus.control.billing.engine import BillingEngine, BillingUnavailable
from nexus.control.billing.payments import PaymentGateway
from nexus.control.billing.razorpay import map_razorpay_method, verify_razorpay_signature
from nexus.control.commercial import (
    Invoice,
    InvoiceLine,
    ensure_razorpay_link,
    invoices,
    payment_links,
    payments,
    settle_invoice,
)
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
    return (
        f"created:{model.id}"
        if model.status == "open" and model.currency == "INR" and str(account.country).upper() == "IN"
        else "created"
    )


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

    if outcome.startswith("created:"):
        created_inv_id = outcome.split(":", 1)[1]
        outcome = "created"
        gateway: PaymentGateway | None = getattr(request.app.state, "razorpay", None)
        if gateway is not None:
            try:
                async with engine_of(request).begin() as link_conn:
                    await ensure_razorpay_link(link_conn, gateway, created_inv_id)
            except Exception:
                log.warning("lago webhook invoice=%s outcome=payment_link_failed", created_inv_id)
    return {"status": outcome}


def _rzp_entities(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    body = payload.get("payload")
    if not isinstance(body, dict):
        raise ApiError(422, "invalid_request", "Missing Razorpay webhook payload.")
    pl = (body.get("payment_link") or {}).get("entity") if isinstance(body.get("payment_link"), dict) else None
    pay = (body.get("payment") or {}).get("entity") if isinstance(body.get("payment"), dict) else None
    return (pl if isinstance(pl, dict) else {}), (pay if isinstance(pay, dict) else {})


@router.post("/billing/razorpay-webhook")
async def razorpay_webhook(request: Request) -> dict[str, str]:
    """Receives Razorpay webhooks signed with `X-Razorpay-Signature` (hex HMAC-SHA256); no staff session."""
    raw = await _read_bounded(request, MAX_WEBHOOK_BYTES)
    secret = request.app.state.settings.razorpay_webhook_secret.get_secret_value().strip()
    sig = (request.headers.get("x-razorpay-signature") or "").strip()
    if not verify_razorpay_signature(raw, sig, secret):
        log.info("razorpay webhook outcome=unauthorized")
        raise ApiError(401, "unauthorized", "Invalid webhook signature.")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ApiError(422, "invalid_request", "Webhook body is not valid JSON.") from exc
    if not isinstance(payload, dict):
        raise ApiError(422, "invalid_request", "Webhook body must be a JSON object.")

    event = str(payload.get("event") or "unknown")[:64]
    event_id = (request.headers.get("x-razorpay-event-id") or "").strip()
    dedupe_key = (
        hashlib.sha256(f"razorpay:{event_id}".encode()).hexdigest()
        if event_id
        else hashlib.sha256(b"razorpay-body:" + raw).hexdigest()
    )

    lago_sync_target: tuple[str, str] | None = None
    async with engine_of(request).begin() as conn:
        inserted = (
            await conn.execute(
                text(
                    "INSERT INTO billing_webhook_events (id, kind)"
                    " VALUES (:id, :kind) ON CONFLICT (id) DO NOTHING RETURNING id"
                ),
                {"id": dedupe_key, "kind": event},
            )
        ).first()
        if inserted is None:
            log.info("razorpay webhook event=%s outcome=duplicate", event)
            return {"status": "duplicate"}

        if event == "payment_link.paid":
            pl_ent, pay_ent = _rzp_entities(payload)
            link_id = str(pl_ent.get("id") or "").strip()
            pay_id = str(pay_ent.get("id") or "").strip()
            if not link_id or not pay_id:
                raise ApiError(422, "invalid_request", "Missing Razorpay link or payment id.")
            link_row = (
                await conn.execute(
                    select(payment_links.c.id, payment_links.c.invoice_id)
                    .where(payment_links.c.gateway == "razorpay", payment_links.c.gateway_link_id == link_id)
                    .with_for_update()
                )
            ).first()
            if link_row is None:
                log.warning("razorpay webhook event=%s link=%s outcome=unknown_link", event, link_id)
                raise ApiError(422, "invalid_request", "Unknown payment link.")
            inv_row = (
                await conn.execute(
                    select(
                        invoices.c.id,
                        invoices.c.account_id,
                        invoices.c.total_minor,
                        invoices.c.currency,
                        invoices.c.lago_invoice_id,
                    )
                    .where(invoices.c.id == link_row.invoice_id)
                    .with_for_update()
                )
            ).one()
            amount = _int_field(pay_ent, "amount")
            currency = str(pay_ent.get("currency") or "").upper()
            if amount != int(inv_row.total_minor) or currency != str(inv_row.currency).upper():
                log.warning(
                    "razorpay webhook event=%s invoice=%s link=%s outcome=amount_mismatch", event, inv_row.id, link_id
                )
                raise ApiError(422, "invalid_request", "Payment amount or currency does not match invoice.")
            new_pay_id = f"pay-rzp-{secrets.token_hex(6)}"
            lago_inv_id = str(inv_row.lago_invoice_id) if inv_row.lago_invoice_id else None
            settled = await settle_invoice(
                conn,
                invoice_id=str(inv_row.id),
                account_id=str(inv_row.account_id),
                amount_minor=amount,
                currency=currency,
                method=map_razorpay_method(str(pay_ent.get("method") or "")),
                gateway="razorpay",
                gateway_ref=pay_id,
                payment_id=new_pay_id,
                lago_synced=(lago_inv_id is None),
            )
            await conn.execute(update(payment_links).where(payment_links.c.id == link_row.id).values(status="paid"))
            if settled is not None and lago_inv_id is not None:
                lago_sync_target = (new_pay_id, lago_inv_id)
            outcome = "paid" if settled is not None else "already_paid"
            log.info(
                "razorpay webhook event=%s invoice=%s link=%s payment=%s outcome=%s",
                event,
                inv_row.id,
                link_id,
                pay_id,
                outcome,
            )
        elif event == "payment_link.expired":
            pl_ent, _ = _rzp_entities(payload)
            link_id = str(pl_ent.get("id") or "").strip()
            if link_id:
                await conn.execute(
                    update(payment_links)
                    .where(
                        payment_links.c.gateway == "razorpay",
                        payment_links.c.gateway_link_id == link_id,
                        payment_links.c.status == "created",
                    )
                    .values(status="expired")
                )
            log.info("razorpay webhook event=%s link=%s outcome=expired", event, link_id or "-")
            outcome = "expired"
        else:
            log.info("razorpay webhook event=%s outcome=ignored", event)
            outcome = "ignored"

    if lago_sync_target is not None:
        pay_pk, lago_inv_id = lago_sync_target
        billing: BillingEngine | None = getattr(request.app.state, "billing", None)
        if billing is not None:
            try:
                await billing.mark_paid(lago_inv_id)
                async with engine_of(request).begin() as sync_conn:
                    await sync_conn.execute(update(payments).where(payments.c.id == pay_pk).values(lago_synced=True))
                log.info("razorpay webhook payment=%s lago_invoice=%s outcome=lago_synced", pay_pk, lago_inv_id)
            except BillingUnavailable:
                log.warning(
                    "razorpay webhook payment=%s lago_invoice=%s outcome=lago_sync_deferred", pay_pk, lago_inv_id
                )
    return {"status": outcome}
