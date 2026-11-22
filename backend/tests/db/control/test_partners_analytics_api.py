"""P12 deals & commissions, P16 analytics API on the control database (NEX-124)."""

from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, ProgrammingError

from nexus.control.seed import load_fixtures

API = "/control/api/v1"
ADMIN, SALES, BILLING, SUPPORT, RELEASE, PARTNER = (
    "stf-0001",
    "stf-0011",
    "stf-0013",
    "stf-0042",
    "stf-0031",
    "stf-0051",
)
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_details_and_404_match_fixtures(api: httpx2.AsyncClient) -> None:
    for path, staff, rows, key in [
        ("/deals", SALES, FIX.deals, "id"),
        ("/commissions", BILLING, FIX.commissions, "id"),
        ("/metrics", SALES, FIX.metrics, "month"),
        ("/account-health", BILLING, FIX.account_health, "accountId"),
    ]:
        res = await get(api, staff, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_key(body["items"], key) == by_key(rows, key), path

    # Filters
    d_ok = (await get(api, SALES, "/deals", partnerId="ptn-south", accountId="acc-lt", status="approved")).json()[
        "items"
    ]
    assert [d["id"] for d in d_ok] == ["deal-lt"]
    assert (await get(api, SALES, "/deals", status="rejected")).json()["total"] == 0

    c_paid = (await get(api, BILLING, "/commissions", partnerId="ptn-south", status="paid")).json()["items"]
    assert [c["id"] for c in c_paid] == ["com-ax-26"]
    c_pay = (await get(api, BILLING, "/commissions", status="payable")).json()["items"]
    assert [c["id"] for c in c_pay] == ["com-al-lic"]

    h_high = (await get(api, SALES, "/account-health", churnRisk="high")).json()["items"]
    assert [h["accountId"] for h in h_high] == ["acc-hm"]

    # Details & 404s
    first_month = FIX.metrics[0]["month"]
    assert (await get(api, SALES, f"/metrics/{first_month}")).json() == FIX.metrics[0]
    assert (await get(api, SALES, "/metrics/2020-01")).status_code == 404
    assert (await get(api, BILLING, "/account-health/acc-ax")).json() == by_key(FIX.account_health, "accountId")[
        "acc-ax"
    ]
    assert (await get(api, BILLING, "/account-health/acc-none")).status_code == 404


@pytest.mark.anyio
async def test_permissions_and_partner_scoping(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    # Unauthenticated -> 401; roles without the read permission -> 403.
    for path in ("/deals", "/commissions", "/metrics", "/account-health"):
        assert (await api.get(f"{API}{path}")).status_code == 401
        assert (await get(api, SUPPORT, path)).status_code == 403
        assert (await get(api, RELEASE, path)).status_code == 403
    assert (await get(api, BILLING, "/deals")).status_code == 403
    assert (await get(api, PARTNER, "/commissions")).status_code == 403
    assert (await get(api, PARTNER, "/metrics")).status_code == 403
    assert (await get(api, PARTNER, "/account-health")).status_code == 403

    # Partner user (`ptn-south`) sees its own deals directly.
    p_deals = (await get(api, PARTNER, "/deals", pageSize=200)).json()["items"]
    assert [d["id"] for d in p_deals] == ["deal-lt"]

    # Partner viewer with partner/analytics roles sees ONLY its accounts' deals & health, never commissions or metrics.
    owner, _ = control_db
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-an', 'Partner An', 'pan@southern.example', "
                    "ARRAY['partner', 'sales', 'billing'], 'ptn-south', true, true) "
                    "ON CONFLICT (id) DO NOTHING"
                )
            )
            # Add another partner's deal so we prove negative deal scoping too.
            conn.execute(
                text(
                    "INSERT INTO deal_registrations (id, partner_id, account_id, status, submitted_at, expires_at) "
                    "VALUES ('deal-euro-test', 'ptn-euro', 'acc-al', 'submitted', '2026-09-02T00:00:00Z', '2026-12-02')"
                )
            )

        deals = (await get(api, "stf-partner-an", "/deals", pageSize=200)).json()["items"]
        assert [d["id"] for d in deals] == ["deal-lt"]

        comms = (await get(api, "stf-partner-an", "/commissions", pageSize=200)).json()
        assert comms["total"] == 0 and comms["items"] == []

        mets = (await get(api, "stf-partner-an", "/metrics", pageSize=200)).json()
        assert mets["total"] == 0 and mets["items"] == []
        assert (await get(api, "stf-partner-an", f"/metrics/{FIX.metrics[0]['month']}")).status_code == 404

        health = (await get(api, "stf-partner-an", "/account-health", pageSize=200)).json()["items"]
        assert [h["accountId"] for h in health] == ["acc-ax"]
        assert (await get(api, "stf-partner-an", "/account-health/acc-ax")).status_code == 200
        assert (await get(api, "stf-partner-an", "/account-health/acc-ls")).status_code == 404
    finally:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM deal_registrations WHERE id = 'deal-euro-test'"))
            conn.execute(text("DELETE FROM staff_users WHERE id = 'stf-partner-an'"))
        eng.dispose()


def test_app_role_read_only_and_db_checks_refuse_invalid_rows(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    app_eng = create_engine(app_url)
    try:
        for stmt in (
            "INSERT INTO deal_registrations (id, partner_id, account_id, status, submitted_at, expires_at) "
            "VALUES ('deal-x', 'ptn-south', 'acc-ax', 'submitted', '2026-09-01T00:00:00Z', '2026-12-01')",
            "UPDATE deal_registrations SET status = 'rejected'",
            "DELETE FROM deal_registrations",
            "UPDATE commissions SET status = 'paid'",
            "DELETE FROM commissions",
            "UPDATE business_metrics SET open_tickets = 0",
            "DELETE FROM business_metrics",
            "UPDATE account_health SET score = 99",
            "DELETE FROM account_health",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(stmt))
    finally:
        app_eng.dispose()

    owner_eng = create_engine(owner_url)
    try:
        for bad_sql in (
            # ARR != 12 * MRR -> refused by DB CHECK.
            "INSERT INTO business_metrics (month, currency, mrr_minor, arr_minor, active_accounts, new_accounts, "
            "churned_accounts, gross_churn_pct, nrr_pct, open_tickets) "
            "VALUES ('2026-12', 'INR', 1000, 12001, 10, 1, 0, 0, 100, 1)",
            # new_accounts > active_accounts -> refused by DB CHECK.
            "INSERT INTO business_metrics (month, currency, mrr_minor, arr_minor, active_accounts, new_accounts, "
            "churned_accounts, gross_churn_pct, nrr_pct, open_tickets) "
            "VALUES ('2026-12', 'INR', 1000, 12000, 5, 6, 0, 0, 100, 1)",
            # Paid commission without paid_at -> refused by DB CHECK.
            "INSERT INTO commissions (id, partner_id, invoice_id, amount_minor, currency, status, paid_at) "
            "VALUES ('com-bad-paid', 'ptn-south', 'inv-ax-26', 100, 'INR', 'paid', NULL)",
            # Unpaid commission with paid_at -> refused by DB CHECK.
            "INSERT INTO commissions (id, partner_id, invoice_id, amount_minor, currency, status, paid_at) "
            "VALUES ('com-bad-unpaid', 'ptn-south', 'inv-ax-26', 100, 'INR', 'payable', '2026-07-01T00:00:00Z')",
            # High churn risk with score >= 50 -> refused by DB CHECK.
            "INSERT INTO account_health (account_id, score, churn_risk, reasons, ai_generated, computed_at) "
            "VALUES ('acc-sr', 50, 'high', ARRAY['p16.reason.lowUsage'], true, '2026-09-15T00:00:00Z')",
            # Low churn risk with score < 70 -> refused by DB CHECK.
            "INSERT INTO account_health (account_id, score, churn_risk, reasons, ai_generated, computed_at) "
            "VALUES ('acc-sr', 69, 'low', ARRAY['p16.reason.steadyUsage'], true, '2026-09-15T00:00:00Z')",
        ):
            with pytest.raises(IntegrityError), owner_eng.begin() as conn:
                conn.exec_driver_sql(bad_sql)
    finally:
        owner_eng.dispose()
