"""DB + ASGI tests for Lago signed invoice webhooks (NEX-111, P03, D51)."""

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.billing.webhooks import MAX_WEBHOOK_BYTES, sign_webhook, tax_scheme_for
from nexus.control.main import create_app
from nexus.control.sessions import DbSessionStore
from nexus.control.settings import ControlSettings
from nexus.control.staff import DbStaffStore
from nexus.core.vault import FakeVault

WEBHOOK_KEY = "lago-test-hmac-secret-key"
STAFF = {"X-Nexus-Staff": "stf-0001"}  # super_admin for GET /invoices checks
URL = "/control/api/v1/billing/lago-webhook"


def _invoice_event(
    *,
    lago_id: str = "a1b2c3d4-e5f6-4789-abcd-0123456789ab",
    account_id: str = "acc-ls",
    status: str = "finalized",
    payment_status: str = "pending",
    currency: str = "INR",
    subtotal: int = 100_000,
    tax: int = 18_000,
    total: int = 118_000,
    fees: list[dict[str, Any]] | None = None,
    webhook_type: str = "invoice.created",
) -> bytes:
    payload: dict[str, Any] = {
        "webhook_type": webhook_type,
        "object_type": "invoice",
        "invoice": {
            "lago_id": lago_id,
            "status": status,
            "payment_status": payment_status,
            "issuing_date": "2026-11-22",
            "payment_due_date": "2026-12-07",
            "currency": currency,
            "sub_total_excluding_taxes_amount_cents": subtotal,
            "taxes_amount_cents": tax,
            "total_amount_cents": total,
            "customer": {"external_id": account_id},
            "fees": (
                [
                    {
                        "item": {"name": "Active learners", "invoice_display_name": "Starter (active learners)"},
                        "units": "35.0",
                        "amount_cents": subtotal,
                    }
                ]
                if fees is None
                else fees
            ),
        },
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


async def _client(app_url: str, webhook_key: str) -> AsyncIterator[httpx2.AsyncClient]:
    engine = create_async_engine(app_url)
    app = create_app(ControlSettings(environment="test", lago_webhook_key=webhook_key))  # type: ignore[arg-type]
    app.state.engine = engine
    app.state.staff = DbStaffStore(engine)
    app.state.sessions = DbSessionStore(engine)
    app.state.vault = FakeVault()
    try:
        async with httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://control.test") as c:
            yield c
    finally:
        await engine.dispose()


def _cleanup(owner_url: str, lago_ids: list[str]) -> None:
    eng = create_engine(owner_url)
    with eng.begin() as conn:
        for lid in lago_ids:
            conn.execute(text("DELETE FROM invoices WHERE lago_invoice_id = :lid"), {"lid": lid})
        conn.execute(text("DELETE FROM billing_webhook_events"))
    eng.dispose()


@pytest.mark.anyio
async def test_valid_webhook_stores_once_updates_payment_and_maps_tax_schemes(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    lid_in = "11112222-3333-4444-5555-666677778888"
    lid_gb = "aaaabbbb-cccc-dddd-eeee-ffff00001111"
    lid_us = "99998888-7777-6666-5555-444433332222"
    try:
        async for c in _client(app_url, WEBHOOK_KEY):
            # 1. Finalized invoice for IN account (GST) — no cookie, no staff header.
            raw = _invoice_event(lago_id=lid_in, account_id="acc-ls", currency="INR")
            res = await c.post(URL, content=raw, headers={"X-Lago-Signature": sign_webhook(raw, WEBHOOK_KEY)})
            assert res.status_code == 200 and res.json()["status"] == "created"

            # 2. Exact replay is a 200 no-op (nothing stored twice).
            replay = await c.post(URL, content=raw, headers={"X-Lago-Signature": sign_webhook(raw, WEBHOOK_KEY)})
            assert replay.status_code == 200 and replay.json()["status"] == "duplicate"

            # 3. Verify GET /invoices?accountId=acc-ls shows it with contract-valid fields & no lagoInvoiceId.
            listed = await c.get("/control/api/v1/invoices", params={"accountId": "acc-ls"}, headers=STAFF)
            assert listed.status_code == 200
            found = [i for i in listed.json()["items"] if i["id"] == "inv-111122223333"]
            assert len(found) == 1
            inv = found[0]
            assert inv["number"].startswith("INV-2026-") and len(inv["number"]) == 15
            assert inv["status"] == "open" and inv["paidAt"] is None
            assert inv["taxScheme"] == "gst" and inv["currency"] == "INR"
            assert (inv["subtotalMinor"], inv["taxMinor"], inv["totalMinor"]) == (100_000, 18_000, 118_000)
            assert inv["lines"] == [
                {"description": "Starter (active learners)", "itemId": None, "quantity": 35, "amountMinor": 100_000}
            ]
            assert "lagoInvoiceId" not in inv and "lago_invoice_id" not in inv

            # 4. Payment failed leaves invoice open; payment succeeded marks it paid with paidAt.
            failed = _invoice_event(
                lago_id=lid_in,
                webhook_type="invoice.payment_status_updated",
                payment_status="failed",
            )
            r_fail = await c.post(URL, content=failed, headers={"X-Lago-Signature": sign_webhook(failed, WEBHOOK_KEY)})
            assert r_fail.status_code == 200 and r_fail.json()["status"] == "unchanged"
            inv_after_fail = (await c.get("/control/api/v1/invoices/inv-111122223333", headers=STAFF)).json()
            assert inv_after_fail["status"] == "open" and inv_after_fail["paidAt"] is None

            paid = _invoice_event(
                lago_id=lid_in,
                webhook_type="invoice.payment_status_updated",
                payment_status="succeeded",
            )
            r_paid = await c.post(URL, content=paid, headers={"X-Lago-Signature": sign_webhook(paid, WEBHOOK_KEY)})
            assert r_paid.status_code == 200 and r_paid.json()["status"] == "paid"
            inv_after_paid = (await c.get("/control/api/v1/invoices/inv-111122223333", headers=STAFF)).json()
            assert inv_after_paid["status"] == "paid" and inv_after_paid["paidAt"] is not None

            # 5. GB -> vat, US -> none (and empty fees falls back to 1 valid line).
            raw_gb = _invoice_event(
                lago_id=lid_gb, account_id="acc-rv", currency="GBP", subtotal=50_000, tax=10_000, total=60_000, fees=[]
            )
            assert (
                await c.post(URL, content=raw_gb, headers={"X-Lago-Signature": sign_webhook(raw_gb, WEBHOOK_KEY)})
            ).status_code == 200
            inv_gb = (await c.get("/control/api/v1/invoices/inv-aaaabbbbcccc", headers=STAFF)).json()
            assert inv_gb["taxScheme"] == "vat" and len(inv_gb["lines"]) == 1

            raw_us = _invoice_event(
                lago_id=lid_us, account_id="acc-nb", currency="USD", subtotal=20_000, tax=0, total=20_000
            )
            assert (
                await c.post(URL, content=raw_us, headers={"X-Lago-Signature": sign_webhook(raw_us, WEBHOOK_KEY)})
            ).status_code == 200
            inv_us = (await c.get("/control/api/v1/invoices/inv-999988887777", headers=STAFF)).json()
            assert inv_us["taxScheme"] == "none"

            assert tax_scheme_for("DE") == "vat" and tax_scheme_for("FR") == "vat" and tax_scheme_for("SG") == "none"
    finally:
        _cleanup(owner_url, [lid_in, lid_gb, lid_us])


@pytest.mark.anyio
async def test_unsigned_wrong_key_empty_key_oversize_unknown_account_and_draft(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    lid_bad = "deadbeef-0000-1111-2222-333344445555"
    lid_draft = "cafebabe-0000-1111-2222-333344445555"
    try:
        raw = _invoice_event(lago_id=lid_bad)

        # Empty configured webhook key refuses everything (401), nothing stored.
        async for c_empty in _client(app_url, ""):
            r = await c_empty.post(URL, content=raw, headers={"X-Lago-Signature": sign_webhook(raw, "anything")})
            assert r.status_code == 401

        async for c in _client(app_url, WEBHOOK_KEY):
            # Missing or wrong signature -> 401.
            assert (await c.post(URL, content=raw)).status_code == 401
            assert (await c.post(URL, content=raw, headers={"X-Lago-Signature": "bad-sig"})).status_code == 401

            # Oversize body (> 256 KB) -> 413.
            big = b"{" + b" " * MAX_WEBHOOK_BYTES + b"}"
            r_big = await c.post(URL, content=big, headers={"X-Lago-Signature": sign_webhook(big, WEBHOOK_KEY)})
            assert r_big.status_code == 413

            # Unknown account -> 422, nothing stored.
            unk = _invoice_event(lago_id=lid_bad, account_id="acc-does-not-exist")
            r_unk = await c.post(URL, content=unk, headers={"X-Lago-Signature": sign_webhook(unk, WEBHOOK_KEY)})
            assert r_unk.status_code == 422

            # Amounts that don't add up -> 422, nothing stored.
            bad_sum = _invoice_event(lago_id=lid_bad, subtotal=100, tax=10, total=999)
            r_sum = await c.post(URL, content=bad_sum, headers={"X-Lago-Signature": sign_webhook(bad_sum, WEBHOOK_KEY)})
            assert r_sum.status_code == 422

            # Draft invoice -> 200 ignored, no invoice row created.
            draft = _invoice_event(lago_id=lid_draft, status="draft")
            r_draft = await c.post(URL, content=draft, headers={"X-Lago-Signature": sign_webhook(draft, WEBHOOK_KEY)})
            assert r_draft.status_code == 200 and r_draft.json()["status"] == "ignored"

            # Unknown webhook event type -> 200 ignored.
            other = json.dumps({"webhook_type": "customer.updated", "customer": {"external_id": "acc-ls"}}).encode()
            r_oth = await c.post(URL, content=other, headers={"X-Lago-Signature": sign_webhook(other, WEBHOOK_KEY)})
            assert r_oth.status_code == 200 and r_oth.json()["status"] == "ignored"

        # None of the refused or draft invoices were stored.
        eng = create_engine(owner_url)
        with eng.connect() as conn:
            cnt = conn.execute(
                text("SELECT count(*) FROM invoices WHERE lago_invoice_id IN (:a, :b)"),
                {"a": lid_bad, "b": lid_draft},
            ).scalar_one()
        eng.dispose()
        assert cnt == 0
    finally:
        _cleanup(owner_url, [lid_bad, lid_draft])
