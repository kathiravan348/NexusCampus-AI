"""Tests for Razorpay payment links and signed payment webhooks (P03, D62, NEX-107)."""

import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.billing.engine import FakeBillingEngine
from nexus.control.billing.payments import PaymentLinkRequest
from nexus.control.billing.razorpay import (
    RAZORPAY_API_BASE,
    RazorpayGateway,
    sign_razorpay_webhook,
)
from nexus.control.billing.sync import sync_to_lago
from nexus.control.billing.webhooks import sign_webhook
from nexus.control.main import create_app
from nexus.control.settings import ControlSettings

API = "/control/api/v1"
BILLING, SALES = "stf-0013", "stf-0011"
RZP_KEY_ID = "rzp_test_id_never_log"
RZP_KEY_SECRET = "rzp_test_val_never_log"  # noqa: S105
RZP_WEBHOOK_SECRET = "whsec_test_razorpay_never_log"  # noqa: S105
LAGO_WEBHOOK_KEY = "whsec_test_lago_107"


def _rzp_webhook_body(
    event: str, *, link_id: str, pay_id: str, amount: int, currency: str = "INR", method: str = "upi"
) -> bytes:
    payload = {
        "event": event,
        "payload": {
            "payment_link": {"entity": {"id": link_id, "amount": amount, "currency": currency}},
            "payment": {"entity": {"id": pay_id, "amount": amount, "currency": currency, "method": method}},
        },
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


@pytest.mark.anyio
async def test_razorpay_link_payload_webhook_settlement_dedupe_lago_retry_and_no_secret_logs(
    control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner_url, app_url = control_db
    captured_requests: list[tuple[str, str, dict[str, Any]]] = []
    next_link_counter = 0

    def rzp_handler(req: httpx2.Request) -> httpx2.Response:
        nonlocal next_link_counter
        body = json.loads(req.content.decode("utf-8")) if req.content else {}
        captured_requests.append((req.method, str(req.url), body))
        if req.method == "POST" and str(req.url) == f"{RAZORPAY_API_BASE}/payment_links":
            next_link_counter += 1
            lid = f"plink_test_{next_link_counter:04d}"
            return httpx2.Response(
                200,
                json={
                    "id": lid,
                    "short_url": f"https://rzp.io/i/{lid}",
                    "status": "created",
                    "expire_by": body["expire_by"],
                },
            )
        if req.method == "GET" and "/payment_links/" in str(req.url):
            lid = str(req.url).rsplit("/", 1)[-1]
            return httpx2.Response(
                200,
                json={
                    "id": lid,
                    "short_url": f"https://rzp.io/i/{lid}",
                    "status": "paid",
                    "expire_by": int(datetime(2026, 12, 31, tzinfo=UTC).timestamp()),
                },
            )
        return httpx2.Response(404)

    rzp = RazorpayGateway(RZP_KEY_ID, RZP_KEY_SECRET, transport=httpx2.MockTransport(rzp_handler))
    fake_lago = FakeBillingEngine()
    cfg = ControlSettings(
        environment="test",
        database_url=SecretStr(app_url),
        migrate_database_url=SecretStr(owner_url),
        lago_webhook_key=SecretStr(LAGO_WEBHOOK_KEY),
        razorpay_key_id=SecretStr(RZP_KEY_ID),
        razorpay_key_secret=SecretStr(RZP_KEY_SECRET),
        razorpay_webhook_secret=SecretStr(RZP_WEBHOOK_SECRET),
    )
    app = create_app(settings=cfg, razorpay=rzp, billing=fake_lago)

    # Seed a test open INR invoice with a lago_invoice_id on acc-ax (IN, has billing contact) + overdue dunning & sub
    eng = create_engine(owner_url)
    created_inv_id = "inv-rzp-test-01"
    lago_inv_id = "lago-inv-rzp-01"
    eu_inv_id = "inv-rzp-eu-01"
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO invoices (id, account_id, number, status, issue_date, due_date, currency, tax_scheme,"
                    " lines, subtotal_minor, tax_minor, total_minor, paid_at, lago_invoice_id) VALUES "
                    "(:id, 'acc-ax', 'INV-2026-9901', 'overdue', '2026-11-01', '2026-12-15', 'INR', 'gst',"
                    " CAST(:lines AS jsonb), 100000, 18000, 118000, NULL, :lid)"
                ),
                {
                    "id": created_inv_id,
                    "lid": lago_inv_id,
                    "lines": json.dumps(
                        [{"description": "Annual plan", "itemId": None, "quantity": 1, "amountMinor": 100000}]
                    ),
                },
            )
            conn.execute(
                text(
                    "INSERT INTO invoices (id, account_id, number, status, issue_date, due_date, currency, tax_scheme,"
                    " lines, subtotal_minor, tax_minor, total_minor, paid_at) VALUES "
                    "(:id, 'acc-nb', 'INV-2026-9902', 'open', '2026-11-01', '2026-12-15', 'EUR', 'vat',"
                    " CAST(:lines AS jsonb), 50000, 9500, 59500, NULL)"
                ),
                {
                    "id": eu_inv_id,
                    "lines": json.dumps(
                        [{"description": "EU plan", "itemId": None, "quantity": 1, "amountMinor": 50000}]
                    ),
                },
            )
            conn.execute(
                text(
                    "INSERT INTO dunning_states (account_id, stage, overdue_minor, currency, next_step_at) "
                    "VALUES ('acc-ax', 'reminder_1', 118000, 'INR', '2026-12-20T00:00:00Z') "
                    "ON CONFLICT (account_id) DO UPDATE SET stage = 'reminder_1', overdue_minor = 118000"
                )
            )
            conn.execute(text("UPDATE subscriptions SET status = 'past_due' WHERE account_id = 'acc-ax'"))

        async with (
            app.router.lifespan_context(app),
            httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), base_url="http://test") as client,
        ):
            with caplog.at_level(logging.DEBUG):
                # Permission check -> 403
                assert (
                    await client.post(f"{API}/invoices/{created_inv_id}/payment-link", headers={"X-Nexus-Staff": SALES})
                ).status_code == 403

                # Non-IN / EUR invoice -> 409
                assert (
                    await client.post(f"{API}/invoices/{eu_inv_id}/payment-link", headers={"X-Nexus-Staff": BILLING})
                ).status_code == 409

                # Create payment link for open/overdue IN INR invoice -> verify exact Razorpay payload
                res = await client.post(
                    f"{API}/invoices/{created_inv_id}/payment-link", headers={"X-Nexus-Staff": BILLING}
                )
                assert res.status_code == 200, res.text
                link_body = res.json()
                assert link_body["url"] == "https://rzp.io/i/plink_test_0001"
                assert len(captured_requests) == 1
                method, url, sent = captured_requests[0]
                assert method == "POST" and url == f"{RAZORPAY_API_BASE}/payment_links"
                assert sent["amount"] == 118000
                assert sent["currency"] == "INR"
                assert sent["accept_partial"] is False
                assert sent["reference_id"] == created_inv_id
                assert sent["description"] == "INV-2026-9901"
                assert sent["options"]["checkout"]["method"] == {
                    "card": True,
                    "upi": True,
                    "netbanking": True,
                    "wallet": False,
                    "emi": False,
                    "paylater": False,
                }
                assert sent["notify"] == {"email": True, "sms": False}
                assert "email" in sent["customer"]

                # Calling again reuses the live link (no second Razorpay HTTP call)
                res2 = await client.post(
                    f"{API}/invoices/{created_inv_id}/payment-link", headers={"X-Nexus-Staff": BILLING}
                )
                assert res2.status_code == 200 and res2.json()["url"] == link_body["url"]
                assert len(captured_requests) == 1

                # Fetch link works
                fetched = await rzp.fetch_link("plink_test_0001")
                assert fetched.status == "paid"

                # Bad / missing signature -> 401
                raw_ok = _rzp_webhook_body(
                    "payment_link.paid", link_id="plink_test_0001", pay_id="pay_Rzp001", amount=118000
                )
                assert (await client.post(f"{API}/billing/razorpay-webhook", content=raw_ok)).status_code == 401
                assert (
                    await client.post(
                        f"{API}/billing/razorpay-webhook",
                        content=raw_ok,
                        headers={"X-Razorpay-Signature": "0" * 64, "X-Razorpay-Event-Id": "evt_bad"},
                    )
                ).status_code == 401

                # Amount mismatch -> 422, nothing paid
                raw_bad_amt = _rzp_webhook_body(
                    "payment_link.paid", link_id="plink_test_0001", pay_id="pay_RzpBad", amount=50000
                )
                res_bad = await client.post(
                    f"{API}/billing/razorpay-webhook",
                    content=raw_bad_amt,
                    headers={
                        "X-Razorpay-Signature": sign_razorpay_webhook(raw_bad_amt, RZP_WEBHOOK_SECRET),
                        "X-Razorpay-Event-Id": "evt_mismatch",
                    },
                )
                assert res_bad.status_code == 422
                assert (
                    await client.get(f"{API}/invoices/{created_inv_id}", headers={"X-Nexus-Staff": BILLING})
                ).json()["status"] == "overdue"

                # Signed payment_link.paid with Lago temporarily failing -> paid in Control, lago_synced=False
                fake_lago.fail_mark_paid = True
                sig_ok = sign_razorpay_webhook(raw_ok, RZP_WEBHOOK_SECRET)
                res_paid = await client.post(
                    f"{API}/billing/razorpay-webhook",
                    content=raw_ok,
                    headers={"X-Razorpay-Signature": sig_ok, "X-Razorpay-Event-Id": "evt_paid_001"},
                )
                assert res_paid.status_code == 200 and res_paid.json() == {"status": "paid"}

                # Invoice paid, one razorpay payment with method=upi, dunning cleared, past_due sub active
                inv_after = (
                    await client.get(f"{API}/invoices/{created_inv_id}", headers={"X-Nexus-Staff": BILLING})
                ).json()
                assert inv_after["status"] == "paid" and inv_after["paidAt"] is not None
                pays = (
                    await client.get(
                        f"{API}/payments", params={"invoiceId": created_inv_id}, headers={"X-Nexus-Staff": BILLING}
                    )
                ).json()["items"]
                assert len(pays) == 1
                assert pays[0]["gateway"] == "razorpay" and pays[0]["gatewayRef"] == "pay_Rzp001"
                assert pays[0]["method"] == "upi" and pays[0]["amountMinor"] == 118000
                dunning = (await client.get(f"{API}/dunning/acc-ax", headers={"X-Nexus-Staff": BILLING})).json()
                assert dunning["stage"] == "none" and dunning["overdueMinor"] == 0
                subs = (
                    await client.get(
                        f"{API}/subscriptions", params={"accountId": "acc-ax"}, headers={"X-Nexus-Staff": BILLING}
                    )
                ).json()["items"]
                assert all(s["status"] != "past_due" for s in subs)

                # Replay with same X-Razorpay-Event-Id -> 200 duplicate, still 1 payment
                res_dup = await client.post(
                    f"{API}/billing/razorpay-webhook",
                    content=raw_ok,
                    headers={"X-Razorpay-Signature": sig_ok, "X-Razorpay-Event-Id": "evt_paid_001"},
                )
                assert res_dup.status_code == 200 and res_dup.json() == {"status": "duplicate"}
                pays2 = (
                    await client.get(
                        f"{API}/payments", params={"invoiceId": created_inv_id}, headers={"X-Nexus-Staff": BILLING}
                    )
                ).json()["items"]
                assert len(pays2) == 1

                # Paid invoice refuses new payment link -> 409
                assert (
                    await client.post(
                        f"{API}/invoices/{created_inv_id}/payment-link", headers={"X-Nexus-Staff": BILLING}
                    )
                ).status_code == 409

                # Lago failure left lago_synced=False; billing_sync retries and marks it synced
                with eng.connect() as conn:
                    synced_before = conn.execute(
                        text("SELECT lago_synced FROM payments WHERE invoice_id = :id"), {"id": created_inv_id}
                    ).scalar_one()
                assert synced_before is False

                fake_lago.fail_mark_paid = False
                async_eng = create_async_engine(app_url)
                try:
                    async with async_eng.begin() as aconn:
                        rep = await sync_to_lago(aconn, fake_lago, dry_run=False)
                    assert pays[0]["id"] in rep.payments_marked_paid
                    assert lago_inv_id in fake_lago.paid_invoices
                finally:
                    await async_eng.dispose()

                with eng.connect() as conn:
                    synced_after = conn.execute(
                        text("SELECT lago_synced FROM payments WHERE invoice_id = :id"), {"id": created_inv_id}
                    ).scalar_one()
                assert synced_after is True

                # Lago invoice.created hook creates link automatically (and failure never blocks invoice storage)
                lago_body = json.dumps(
                    {
                        "webhook_type": "invoice.created",
                        "invoice": {
                            "lago_id": "lago-auto-link-99",
                            "status": "finalized",
                            "payment_status": "pending",
                            "issuing_date": "2026-11-23",
                            "payment_due_date": "2026-12-23",
                            "currency": "INR",
                            "sub_total_excluding_taxes_amount_cents": 20000,
                            "taxes_amount_cents": 3600,
                            "total_amount_cents": 23600,
                            "customer": {"external_id": "acc-ax"},
                            "fees": [{"amount_cents": 20000, "units": "1", "item": {"name": "Monthly plan"}}],
                        },
                    }
                ).encode("utf-8")
                res_lago = await client.post(
                    f"{API}/billing/lago-webhook",
                    content=lago_body,
                    headers={"X-Lago-Signature": sign_webhook(lago_body, LAGO_WEBHOOK_KEY)},
                )
                assert res_lago.status_code == 200 and res_lago.json() == {"status": "created"}
                assert len([r for r in captured_requests if r[0] == "POST"]) == 2

                # payment_link.expired updates link status; unknown events ignored (200)
                raw_exp = _rzp_webhook_body("payment_link.expired", link_id="plink_test_0002", pay_id="", amount=23600)
                res_exp = await client.post(
                    f"{API}/billing/razorpay-webhook",
                    content=raw_exp,
                    headers={
                        "X-Razorpay-Signature": sign_razorpay_webhook(raw_exp, RZP_WEBHOOK_SECRET),
                        "X-Razorpay-Event-Id": "evt_exp_001",
                    },
                )
                assert res_exp.status_code == 200 and res_exp.json() == {"status": "expired"}
                raw_other = json.dumps({"event": "order.paid"}).encode("utf-8")
                res_other = await client.post(
                    f"{API}/billing/razorpay-webhook",
                    content=raw_other,
                    headers={
                        "X-Razorpay-Signature": sign_razorpay_webhook(raw_other, RZP_WEBHOOK_SECRET),
                        "X-Razorpay-Event-Id": "evt_other_001",
                    },
                )
                assert res_other.status_code == 200 and res_other.json() == {"status": "ignored"}

                # No Razorpay secret ever appears in logs
                logged = "\n".join(r.getMessage() for r in caplog.records)
                for secret in (RZP_KEY_ID, RZP_KEY_SECRET, RZP_WEBHOOK_SECRET):
                    assert secret not in logged
    finally:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM payment_links"))
            conn.execute(text("DELETE FROM payments WHERE invoice_id = :id"), {"id": created_inv_id})
            conn.execute(
                text("DELETE FROM invoices WHERE id IN (:i1, :i2) OR lago_invoice_id = 'lago-auto-link-99'"),
                {"i1": created_inv_id, "i2": eu_inv_id},
            )
            conn.execute(text("DELETE FROM billing_webhook_events"))
            conn.execute(
                text(
                    "UPDATE dunning_states SET stage = 'none', overdue_minor = 0, next_step_at = NULL "
                    "WHERE account_id = 'acc-ax'"
                )
            )
            conn.execute(text("UPDATE subscriptions SET status = 'active' WHERE account_id = 'acc-ax'"))
        eng.dispose()


def test_razorpay_payload_rejects_non_inr() -> None:
    from nexus.control.billing.payments import PaymentGatewayError
    from nexus.control.billing.razorpay import build_payment_link_payload

    with pytest.raises(PaymentGatewayError):
        build_payment_link_payload(
            PaymentLinkRequest(
                invoice_id="inv-1",
                invoice_number="INV-2026-0001",
                amount_minor=1000,
                currency="EUR",
                expire_by=datetime(2026, 12, 31, tzinfo=UTC),
            )
        )
