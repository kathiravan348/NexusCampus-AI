"""DB tests for one-way idempotent Lago billing sync (NEX-118) using `FakeBillingEngine` as `control_app`."""

from dataclasses import asdict
from typing import Any

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.billing.engine import BillingCustomer, BillingPlan, BillingUnavailable, FakeBillingEngine
from nexus.control.billing.sync import sync_to_lago
from nexus.control.seed import load_fixtures

FIX = load_fixtures()


@pytest.mark.anyio
async def test_sync_seeded_fixtures_is_idempotent_and_metadata_only(control_db: tuple[str, str]) -> None:
    _, app_url = control_db
    fake = FakeBillingEngine()
    db = create_async_engine(app_url)
    try:
        async with db.connect() as conn:
            first = await sync_to_lago(conn, fake)
            second = await sync_to_lago(conn, fake)
    finally:
        await db.dispose()

    assert fake.metric is True
    # 3 active per-learner SaaS plans (starter: 5 countries, standard: 5, enterprise: 3) * (monthly + yearly) = 26.
    assert len(first.plans) == 26
    assert {"starter-inr-monthly", "standard-gbp-yearly", "enterprise-usd-yearly", "standard-inr-yearly"} <= set(
        fake.plans
    )
    assert fake.plans["starter-inr-monthly"].per_learner_minor == 2900
    assert fake.plans["standard-gbp-yearly"].per_learner_minor == 1800
    assert fake.plans["enterprise-usd-yearly"].per_learner_minor == 3600

    # 6 subscribing SaaS accounts (Little Steps, Riverside, Northbridge, Apex, Harmony, Sunrise) — self-hosted / leads
    # / churned accounts are not pushed.
    assert set(first.customers) == {"acc-ls", "acc-rv", "acc-nb", "acc-ax", "acc-hm", "acc-sr"}
    assert fake.customers["acc-rv"] == BillingCustomer("acc-rv", "Riverside Education Group", "GB", "GBP")
    assert fake.customers["acc-nb"] == BillingCustomer("acc-nb", "Northbridge University", "US", "USD")
    assert fake.customers["acc-hm"] == BillingCustomer("acc-hm", "Harmony Music Academy", "SG", "SGD")

    # Never any contact data or e-mail in what is sent to the billing engine (V-7).
    sent_blob = str(
        {
            "customers": [asdict(c) for c in fake.customers.values()],
            "plans": [asdict(p) for p in fake.plans.values()],
            "subscriptions": fake.subscriptions,
            "events": [asdict(e) for e in fake.events.values()],
        }
    )
    assert "@" not in sent_blob
    for contact in FIX.contacts:
        assert contact["workEmail"] not in sent_blob

    # All 6 non-cancelled subscriptions synced with the exact currency & period plan codes.
    assert set(first.subscriptions) == {"sub-ls", "sub-rv", "sub-nb", "sub-ax", "sub-hm", "sub-sr"}
    assert fake.subscriptions["sub-ls"] == ("acc-ls", "starter-inr-monthly")
    assert fake.subscriptions["sub-rv"] == ("acc-rv", "standard-gbp-yearly")
    assert fake.subscriptions["sub-nb"] == ("acc-nb", "enterprise-usd-yearly")
    assert fake.subscriptions["sub-ax"] == ("acc-ax", "standard-inr-yearly")
    assert fake.subscriptions["sub-hm"] == ("acc-hm", "starter-sgd-monthly")
    assert fake.subscriptions["sub-sr"] == ("acc-sr", "standard-inr-monthly")
    # A trial is free: trialing subscriptions start billing in Lago at their trial end, others at the period start.
    assert fake.started_at["sub-hm"] == "2026-09-19T00:00:00Z"
    assert fake.started_at["sub-sr"] == "2026-10-13T00:00:00Z"
    assert fake.started_at["sub-rv"] == "2026-04-01T00:00:00Z"

    # 5 SaaS learner usage records synced (use-ct-l is self-hosted with no synced tenant subscription → skipped).
    assert set(first.usage_events) == {"use-ls-l", "use-rv-l", "use-nb-l", "use-ax-l", "use-hm-l"}
    assert len(fake.events) == 5
    assert fake.events["use-rv-l"].learners == 1460
    assert fake.events["use-rv-l"].subscription_id == "sub-rv"

    # Skipped items include the 8 non-saas_plan catalogue items and the self-hosted learner usage record, ids only.
    skipped_ids = {s.id for s in first.skipped}
    expected_skipped = {c["id"] for c in FIX.catalogue if c["kind"] != "saas_plan"} | {"use-ct-l"}
    assert expected_skipped <= skipped_ids
    for item in first.skipped:
        assert "Coastal" not in item.reason and "@" not in item.reason

    # Idempotent re-run sends the exact same ids and counts nothing twice.
    assert second == first
    rv_usage = await fake.current_usage("acc-rv", "sub-rv")
    assert (rv_usage.learners, rv_usage.amount_minor, rv_usage.currency) == (1460, 2628000, "GBP")


@pytest.mark.anyio
async def test_skips_unpriced_country_cancelled_sub_and_non_per_learner_item(
    control_db: tuple[str, str],
) -> None:
    owner_url, app_url = control_db
    owner = create_engine(owner_url)
    try:
        with owner.begin() as conn:
            # Flat-rate SaaS plan (non-per-learner unit → skipped)
            flat_price = '[{"country":"IN","currency":"INR","amountMinor":5000,"taxRatePct":18}]'
            conn.execute(
                text(
                    "INSERT INTO catalogue_items"
                    " (id, code, name, kind, modules, unit, credits, prices, active)"
                    " VALUES ('cat-flat-test', 'flat-saas', 'Flat SaaS', 'saas_plan', ARRAY['M01'],"
                    "  'flat_month', NULL, CAST(:prices AS jsonb), true)"
                ),
                {"prices": flat_price},
            )
            # Account in JP (no regional price on starter → skipped, never guesses a currency)
            conn.execute(
                text(
                    "INSERT INTO accounts"
                    " (id, name, institution_type, country, region, delivery_model, stage, owner_staff_id,"
                    "  partner_id, tenant_ids, learner_count, health_score, renewal_date, created_at)"
                    " VALUES ('acc-jp-test', 'Tokyo Academy', 'k12', 'JP', 'apac', 'saas_shared', 'customer',"
                    "  'stf-0011', NULL, ARRAY['ten-jp-test'], 100, 80, NULL, '2026-09-01T00:00:00Z')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO subscriptions"
                    " (id, account_id, tenant_id, plan_item_id, addon_item_ids, status, period, learners,"
                    "  current_period_start, current_period_end, trial_ends_at)"
                    " VALUES"
                    " ('sub-jp-test', 'acc-jp-test', 'ten-jp-test', 'cat-starter', ARRAY[]::text[], 'active',"
                    "  'monthly', 100, '2026-09-01', '2026-09-30', NULL),"
                    " ('sub-cancel-test', 'acc-ls', 'ten-ls-old', 'cat-starter', ARRAY[]::text[], 'cancelled',"
                    "  'monthly', 50, '2026-08-01', '2026-08-31', NULL)"
                )
            )

        fake = FakeBillingEngine()
        db = create_async_engine(app_url)
        try:
            async with db.connect() as conn:
                report = await sync_to_lago(conn, fake)
        finally:
            await db.dispose()

        skipped = {s.id: s.reason for s in report.skipped}
        assert "cat-flat-test" in skipped and "not per-learner" in skipped["cat-flat-test"]
        assert "acc-jp-test" in skipped and "JP" in skipped["acc-jp-test"]
        assert "sub-jp-test" in skipped
        assert "sub-cancel-test" in skipped and "cancelled" in skipped["sub-cancel-test"]
        assert "acc-jp-test" not in fake.customers
        assert "sub-cancel-test" not in fake.subscriptions
    finally:
        with owner.begin() as conn:
            conn.execute(text("DELETE FROM subscriptions WHERE id IN ('sub-jp-test', 'sub-cancel-test')"))
            conn.execute(text("DELETE FROM accounts WHERE id = 'acc-jp-test'"))
            conn.execute(text("DELETE FROM catalogue_items WHERE id = 'cat-flat-test'"))
        owner.dispose()


@pytest.mark.anyio
async def test_billing_unavailable_stops_the_run_and_names_the_step(control_db: tuple[str, str]) -> None:
    _, app_url = control_db

    class _FailingPlansEngine(FakeBillingEngine):
        async def upsert_plan(self, plan: BillingPlan) -> None:
            raise BillingUnavailable("lago returned 503")

    failing: Any = _FailingPlansEngine()
    db = create_async_engine(app_url)
    try:
        async with db.connect() as conn:
            with pytest.raises(BillingUnavailable, match="plans"):
                await sync_to_lago(conn, failing)
    finally:
        await db.dispose()
    # Stopped at plans: no customers or subscriptions were sent.
    assert failing.customers == {}
    assert failing.subscriptions == {}
