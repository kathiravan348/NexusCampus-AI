"""`BillingEngine` (D51, NEX-098): Lago adapter request shapes at the HTTP boundary, and the in-memory fake."""

import json
from typing import Any

import httpx2
import pytest

from nexus.control.billing.engine import (
    BillingCustomer,
    BillingPlan,
    BillingUnavailable,
    FakeBillingEngine,
    UsageEvent,
)
from nexus.control.billing.lago import LagoBillingEngine, major

KEY = "test-lago-key"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class FakeLago:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any]] = []
        self.metric = False
        self.events: set[str] = set()
        self.down = False

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        if self.down:
            raise httpx2.ConnectError("down", request=request)
        assert request.headers["Authorization"] == f"Bearer {KEY}"
        body: Any = json.loads(request.content) if request.content else {}
        path = request.url.path.removeprefix("/api/v1")
        self.calls.append((request.method, path, body))
        if path == "/billable_metrics/active_learners":
            return (
                httpx2.Response(200, json={"billable_metric": {"lago_id": "bm-1"}})
                if self.metric
                else (httpx2.Response(404, json={}))
            )
        if path == "/billable_metrics":
            self.metric = True
            return httpx2.Response(200, json={})
        if request.method == "GET" and path.startswith(("/plans/", "/subscriptions/")):
            return httpx2.Response(404, json={})
        if path == "/events":
            tid = body["event"]["transaction_id"]
            if tid in self.events:
                return httpx2.Response(
                    422,
                    json={"code": "validation_errors", "error_details": {"transaction_id": ["value_already_exist"]}},
                )
            self.events.add(tid)
            return httpx2.Response(200, json={})
        if path.endswith("/current_usage"):
            return httpx2.Response(
                200,
                json={
                    "customer_usage": {
                        "currency": "INR",
                        "total_amount_cents": 750000,
                        "charges_usage": [{"units": "150.0"}],
                    }
                },
            )
        if path == "/invoices":
            inv = {"lago_id": "inv-1", "number": "NC-1", "status": "finalized", "currency": "INR"}
            return httpx2.Response(200, json={"invoices": [{**inv, "total_amount_cents": 100}]})
        return httpx2.Response(200, json={})


def engine(fake: FakeLago) -> LagoBillingEngine:
    http = httpx2.AsyncClient(transport=httpx2.MockTransport(fake.handler))
    return LagoBillingEngine("http://lago.test", KEY, http)


@pytest.mark.anyio
async def test_lago_request_shapes_carry_metadata_only() -> None:
    fake = FakeLago()
    lago = engine(fake)
    await lago.ensure_learner_metric()
    await lago.upsert_customer(BillingCustomer("acc-sr", "Sunrise Montessori", "IN", "INR"))
    await lago.upsert_plan(BillingPlan("std-in-m", "Standard", "monthly", "INR", 0, 5000))
    await lago.subscribe("acc-sr", "sub-1", "std-in-m")
    posts = {path: body for method, path, body in fake.calls if method == "POST"}
    assert posts["/billable_metrics"]["billable_metric"]["aggregation_type"] == "max_agg"
    assert posts["/customers"] == {
        "customer": {"external_id": "acc-sr", "name": "Sunrise Montessori", "country": "IN", "currency": "INR"}
    }
    charge = posts["/plans"]["plan"]["charges"][0]
    assert (charge["billable_metric_id"], charge["properties"]) == ("bm-1", {"amount": "50.00"})
    assert posts["/subscriptions"]["subscription"]["external_id"] == "sub-1"


@pytest.mark.anyio
async def test_usage_is_idempotent_and_read_back() -> None:
    fake = FakeLago()
    lago = engine(fake)
    await lago.record_usage(UsageEvent("evt-1", "sub-1", 120, 1_800_000_000))
    await lago.record_usage(UsageEvent("evt-1", "sub-1", 999, 1_800_000_000))  # already counted: no error
    usage = await lago.current_usage("acc-sr", "sub-1")
    assert (usage.amount_minor, usage.learners, usage.currency) == (750000, 150, "INR")
    assert [i.number for i in await lago.invoices("acc-sr")] == ["NC-1"]


@pytest.mark.anyio
async def test_errors_become_billing_unavailable() -> None:
    fake = FakeLago()
    lago = engine(fake)
    with pytest.raises(BillingUnavailable):  # metric missing
        await lago.upsert_plan(BillingPlan("p", "P", "yearly", "EUR", 0, 100))
    fake.down = True
    with pytest.raises(BillingUnavailable):
        await lago.upsert_customer(BillingCustomer("acc-x", "X", "DE", "EUR"))


@pytest.mark.anyio
async def test_fake_engine_counts_the_highest_learner_number_once_per_event() -> None:
    billing = FakeBillingEngine()
    await billing.upsert_customer(BillingCustomer("acc-1", "One", "IN", "INR"))
    await billing.upsert_plan(BillingPlan("p", "P", "monthly", "INR", 0, 5000))
    await billing.subscribe("acc-1", "s", "p")
    await billing.record_usage(UsageEvent("e1", "s", 120, 1))
    await billing.record_usage(UsageEvent("e1", "s", 999, 1))
    await billing.record_usage(UsageEvent("e2", "s", 150, 2))
    usage = await billing.current_usage("acc-1", "s")
    assert (usage.learners, usage.amount_minor) == (150, 750000)


def test_major_units() -> None:
    assert major(5000) == "50.00"
    assert major(1) == "0.01"
