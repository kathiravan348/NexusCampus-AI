"""P02 / P03 / P11 API on the control database (NEX-102): same data as the mocks, scoping, the two writes."""

from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.control.seed import load_fixtures

API = "/control/api/v1"
ADMIN, SALES, BILLING, PARTNER, RELEASE = "stf-0001", "stf-0011", "stf-0013", "stf-0051", "stf-0031"
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


async def post(api: httpx2.AsyncClient, staff: str, path: str, body: Any) -> httpx2.Response:
    return await api.post(f"{API}{path}", json=body, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_equal_the_mock_fixtures(api: httpx2.AsyncClient) -> None:
    for path, rows, key in [
        ("/catalogue", FIX.catalogue, "id"),
        ("/quotes", FIX.quotes, "id"),
        ("/subscriptions", FIX.subscriptions, "id"),
        ("/invoices", FIX.invoices, "id"),
        ("/payments", FIX.payments, "id"),
        ("/credit-notes", FIX.credit_notes, "id"),
        ("/dunning", FIX.dunning, "accountId"),
        ("/usage", FIX.usage, "id"),
    ]:
        res = await get(api, ADMIN, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_key(body["items"], key) == by_key(rows, key), path


@pytest.mark.anyio
async def test_filters_details_permissions_and_partner_scope(api: httpx2.AsyncClient) -> None:
    overdue = (await get(api, BILLING, "/invoices", status="overdue")).json()["items"]
    assert [i["id"] for i in overdue] == ["inv-ls-09"]
    assert (await get(api, BILLING, "/dunning/acc-ls")).json()["stage"] == "reminder_1"
    assert (await get(api, "stf-0042", "/quotes/quo-sr-1")).status_code == 403  # support has no ctl.quote.read
    assert (await get(api, RELEASE, "/invoices")).status_code == 403
    learners = (await get(api, ADMIN, "/usage", metric="learners", pageSize=200)).json()["items"]
    assert learners and all(u["metric"] == "learners" for u in learners)
    # Partner users: their accounts' quotes only, and no catalogue rows (as the mocks).
    quotes = (await get(api, PARTNER, "/quotes", pageSize=200)).json()["items"]
    assert {q["accountId"] for q in quotes} <= {"acc-ax", "acc-al", "acc-lt"} and quotes
    assert (await get(api, PARTNER, "/quotes/quo-sr-1")).status_code == 404
    assert (await get(api, PARTNER, "/catalogue")).json()["total"] == 0


@pytest.mark.anyio
async def test_sending_quotes(api: httpx2.AsyncClient) -> None:
    refused = await post(api, SALES, "/quotes/quo-ax-ai/send", {})
    assert refused.status_code == 400
    assert refused.json()["error"]["details"][0]["path"] == "checkedByHuman"
    sent = await post(api, SALES, "/quotes/quo-ax-ai/send", {"checkedByHuman": True})
    assert (sent.status_code, sent.json()["status"]) == (200, "sent")
    assert (await post(api, SALES, "/quotes/quo-ax-ai/send", {"checkedByHuman": True})).status_code == 409
    assert (await post(api, BILLING, "/quotes/quo-sr-1/send", {})).status_code == 403
    plain = await api.post(f"{API}/quotes/quo-sr-1/send", headers={"X-Nexus-Staff": SALES})  # no body at all
    assert (plain.status_code, plain.json()["status"]) == (200, "sent")


@pytest.mark.anyio
async def test_recording_a_bank_transfer(api: httpx2.AsyncClient) -> None:
    res = await post(api, BILLING, "/invoices/inv-ls-09/record-transfer", {"reference": " HDFC-2026-11-0042 "})
    assert res.status_code == 200
    body = res.json()
    assert body["invoice"]["status"] == "paid" and body["invoice"]["paidAt"]
    payment = body["payment"]
    assert (payment["gateway"], payment["method"], payment["gatewayRef"]) == (
        "manual",
        "bank_transfer",
        "HDFC-2026-11-0042",
    )
    assert payment["amountMinor"] == body["invoice"]["totalMinor"]
    assert (await get(api, BILLING, "/dunning/acc-ls")).json()["stage"] == "none"
    assert (await get(api, BILLING, "/subscriptions/sub-ls")).json()["status"] == "active"
    payments = (await get(api, BILLING, "/payments", invoiceId="inv-ls-09")).json()["items"]
    assert any(p["id"] == payment["id"] for p in payments)
    assert (await post(api, BILLING, "/invoices/inv-ls-09/record-transfer", {"reference": "again"})).status_code == 409
    assert (await post(api, BILLING, "/invoices/inv-nb-26/record-transfer", {"reference": "x"})).status_code == 400
    assert (await post(api, SALES, "/invoices/inv-nb-26/record-transfer", {"reference": "REF-1"})).status_code == 403


def test_app_role_cannot_rewrite_or_delete_billing(control_db: tuple[str, str]) -> None:
    _, app_url = control_db
    engine = create_engine(app_url)
    with engine.connect() as conn:
        for sql in (
            "UPDATE invoices SET total_minor = 1",
            "DELETE FROM payments",
            "UPDATE quotes SET lines = '[]'",
            "INSERT INTO catalogue_items (id) VALUES ('x')",
        ):
            with pytest.raises(ProgrammingError):
                conn.execute(text(sql))
            conn.rollback()
    engine.dispose()
