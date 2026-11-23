"""`LagoBillingEngine`: the `BillingEngine` over Lago's REST API v1 (D51), authenticated with the org API key.

Amounts: our contracts use minor units; Lago plans take `amount_cents` and charge prices as decimal strings in major
units (2-decimal currencies: INR, EUR). Failures never echo Lago response bodies into logs or errors.
"""

from decimal import Decimal
from typing import Any

import httpx2

from nexus.control.billing.engine import (
    LEARNER_METRIC,
    BillingCustomer,
    BillingPlan,
    BillingUnavailable,
    CurrentUsage,
    Invoice,
    UsageEvent,
)


def major(minor: int) -> str:
    return str((Decimal(minor) / 100).quantize(Decimal("0.01")))


def _already_counted(res: httpx2.Response) -> bool:
    """Lago answers 422 `transaction_id: value_already_exist` for a repeated event: it was counted once already."""
    if res.status_code != 422:
        return False
    try:
        details = res.json().get("error_details", {})
    except ValueError:
        return False
    return isinstance(details, dict) and "value_already_exist" in details.get("transaction_id", [])


class LagoBillingEngine:
    def __init__(self, base_url: str, api_key: str, http: httpx2.AsyncClient) -> None:
        self._base = base_url.rstrip("/") + "/api/v1"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._http = http

    async def _call(self, method: str, path: str, **kw: Any) -> httpx2.Response:
        try:
            return await self._http.request(method, self._base + path, headers=self._headers, **kw)
        except httpx2.HTTPError as exc:
            raise BillingUnavailable("billing engine not reachable") from exc

    async def _ok(self, method: str, path: str, **kw: Any) -> dict[str, Any]:
        res = await self._call(method, path, **kw)
        if res.status_code >= 300:
            raise BillingUnavailable(f"billing engine refused {method} {path.split('?')[0]} ({res.status_code})")
        body: dict[str, Any] = res.json() if res.content else {}
        return body

    async def _exists(self, path: str) -> dict[str, Any] | None:
        res = await self._call("GET", path)
        if res.status_code == 404:
            return None
        if res.status_code >= 300:
            raise BillingUnavailable(f"billing engine refused GET {path} ({res.status_code})")
        body: dict[str, Any] = res.json()
        return body

    async def ensure_learner_metric(self) -> None:
        if await self._exists(f"/billable_metrics/{LEARNER_METRIC}") is None:
            await self._ok(
                "POST",
                "/billable_metrics",
                json={
                    "billable_metric": {
                        "name": "Active learners",
                        "code": LEARNER_METRIC,
                        "description": "Highest number of active learners in the period (D52). A count only.",
                        "aggregation_type": "max_agg",
                        "field_name": "learners",
                        "recurring": False,
                    }
                },
            )

    async def upsert_customer(self, customer: BillingCustomer) -> None:
        # Lago creates or updates by external_id.
        await self._ok(
            "POST",
            "/customers",
            json={
                "customer": {
                    "external_id": customer.account_id,
                    "name": customer.legal_name,
                    "country": customer.country,
                    "currency": customer.currency,
                }
            },
        )

    async def upsert_plan(self, plan: BillingPlan) -> None:
        metric = await self._exists(f"/billable_metrics/{LEARNER_METRIC}")
        if metric is None:
            raise BillingUnavailable("learner metric missing; call ensure_learner_metric first")
        body = {
            "plan": {
                "name": plan.name,
                "code": plan.code,
                "interval": plan.interval,
                "amount_cents": plan.base_amount_minor,
                "amount_currency": plan.currency,
                "pay_in_advance": True,
                "charges": [
                    {
                        "billable_metric_id": metric["billable_metric"]["lago_id"],
                        "charge_model": "standard",
                        "pay_in_advance": False,
                        "properties": {"amount": major(plan.per_learner_minor)},
                    }
                ],
            }
        }
        if await self._exists(f"/plans/{plan.code}") is None:
            await self._ok("POST", "/plans", json=body)
        else:
            await self._ok("PUT", f"/plans/{plan.code}", json=body)

    async def subscribe(
        self, account_id: str, subscription_id: str, plan_code: str, *, started_at: str | None = None
    ) -> None:
        if await self._exists(f"/subscriptions/{subscription_id}") is not None:
            return
        payload: dict[str, Any] = {
            "external_customer_id": account_id,
            "plan_code": plan_code,
            "external_id": subscription_id,
        }
        if started_at is not None:
            payload["subscription_at"] = started_at
            payload["billing_time"] = "anniversary"
        await self._ok("POST", "/subscriptions", json={"subscription": payload})

    async def terminate(self, subscription_id: str) -> bool:
        """Ends an active subscription in Lago; returns False when already ended or unknown."""
        res = await self._call("DELETE", f"/subscriptions/{subscription_id}")
        if res.status_code < 300:
            return True
        if res.status_code in (404, 405):
            return False
        raise BillingUnavailable(f"billing engine refused DELETE /subscriptions/{subscription_id} ({res.status_code})")

    async def record_usage(self, event: UsageEvent) -> None:
        res = await self._call(
            "POST",
            "/events",
            json={
                "event": {
                    "transaction_id": event.transaction_id,
                    "external_subscription_id": event.subscription_id,
                    "code": LEARNER_METRIC,
                    "timestamp": event.timestamp,
                    "properties": {"learners": event.learners},
                }
            },
        )
        if res.status_code < 300 or _already_counted(res):
            return
        raise BillingUnavailable(f"billing engine refused POST /events ({res.status_code})")

    async def current_usage(self, account_id: str, subscription_id: str) -> CurrentUsage:
        body = await self._ok(
            "GET",
            f"/customers/{account_id}/current_usage",
            params={"external_subscription_id": subscription_id},
        )
        usage = body["customer_usage"]
        learners = sum(int(Decimal(str(c.get("units", "0")))) for c in usage.get("charges_usage", []))
        return CurrentUsage(subscription_id, usage["currency"], int(usage["total_amount_cents"]), learners)

    async def invoices(self, account_id: str) -> list[Invoice]:
        body = await self._ok("GET", "/invoices", params={"external_customer_id": account_id})
        return [
            Invoice(i["lago_id"], i["number"], i["status"], i["currency"], int(i["total_amount_cents"]))
            for i in body.get("invoices", [])
        ]

    async def mark_paid(self, lago_invoice_id: str) -> None:
        """Marks an externally paid invoice as succeeded in Lago (NEX-107, D62)."""
        await self._ok("PUT", f"/invoices/{lago_invoice_id}", json={"invoice": {"payment_status": "succeeded"}})
