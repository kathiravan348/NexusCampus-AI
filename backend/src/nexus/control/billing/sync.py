"""One-way, idempotent sync from Control's database into Lago via `BillingEngine` (NEX-118, D51/D52).

Reads `nexus_control` as `control_app` (read-only) and pushes only commercial metadata and learner counts:
1. Learner billable metric (`active_learners`).
2. Active per-learner `saas_plan` catalogue items → one Lago plan per regional price (`<code-currency-interval>`).
3. Accounts with an eligible (`trialing` / `active` / `past_due`) subscription → `BillingCustomer(id, name, country,
   currency)` — never contacts, e-mails, phone numbers or institution data (V-7).
4. Eligible subscriptions → `subscribe(account_id, subscription_id, plan_code, started_at=...)`.
5. `learners` usage records for synced tenants → `UsageEvent(transaction_id=usage.id, ...)`.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from nexus.control.accounts import accounts
from nexus.control.billing.engine import (
    BillingCustomer,
    BillingEngine,
    BillingPlan,
    BillingUnavailable,
    FakeBillingEngine,
    Interval,
    UsageEvent,
)
from nexus.control.commercial import RegionalPrice, catalogue_items, invoices, payments, subscriptions, usage_records

ACTIVE_SUB_STATUSES = ("trialing", "active", "past_due")
PER_LEARNER_UNITS = ("per_learner_month", "per_learner_year")


@dataclass(frozen=True)
class SkippedItem:
    #: Record id only — never names, e-mails or secrets.
    id: str
    reason: str


@dataclass(frozen=True)
class SyncReport:
    dry_run: bool
    plans: list[str] = field(default_factory=list)
    customers: list[str] = field(default_factory=list)
    subscriptions: list[str] = field(default_factory=list)
    terminated: list[str] = field(default_factory=list)
    usage_events: list[str] = field(default_factory=list)
    payments_marked_paid: list[str] = field(default_factory=list)
    skipped: list[SkippedItem] = field(default_factory=list)


def plan_code_for(item_code: str, currency: str, interval: Interval) -> str:
    return f"{item_code}-{currency.lower()}-{interval}"


def _interval_for_period(period: str) -> Interval:
    return "monthly" if period == "monthly" else "yearly"


def _iso_start(day: date) -> str:
    return f"{day.isoformat()}T00:00:00Z"


def _billing_start(sub: Any) -> date:
    """When Lago starts billing: a trial is free, so a trialing subscription starts at its trial end."""
    if str(sub["status"]) == "trialing" and sub["trial_ends_at"] is not None:
        return date.fromisoformat(str(sub["trial_ends_at"]))
    return date.fromisoformat(str(sub["current_period_start"]))


def _unix_seconds(instant: datetime) -> int:
    return int(instant.timestamp())


async def sync_to_lago(
    conn: AsyncConnection,
    engine: BillingEngine,
    dry_run: bool = False,
) -> SyncReport:
    """Pushes per-learner plans, subscribing accounts, subscriptions and learner usage to `engine`."""
    target: BillingEngine = engine if (not dry_run or isinstance(engine, FakeBillingEngine)) else FakeBillingEngine()
    skipped: list[SkippedItem] = []
    plan_codes: list[str] = []
    customer_ids: list[str] = []
    subscription_ids: list[str] = []
    usage_ids: list[str] = []

    # 1. Learner metric
    try:
        await target.ensure_learner_metric()
    except BillingUnavailable as exc:
        raise BillingUnavailable(f"metric: {exc}") from exc

    # 2. Plans (active per-learner SaaS plans only)
    cat_rows = (await conn.execute(select(catalogue_items).order_by(catalogue_items.c.id))).mappings().all()
    item_meta: dict[str, tuple[str, str]] = {}
    item_prices: dict[str, dict[str, tuple[str, int]]] = {}
    synced_plans: set[str] = set()

    for item in cat_rows:
        item_id = str(item["id"])
        if not item["active"]:
            skipped.append(SkippedItem(item_id, "inactive catalogue item"))
            continue
        if item["kind"] != "saas_plan":
            skipped.append(SkippedItem(item_id, f"kind {item['kind']} not synced in part 1"))
            continue
        unit = str(item["unit"])
        if unit not in PER_LEARNER_UNITS:
            skipped.append(SkippedItem(item_id, f"unit {unit} is not per-learner"))
            continue

        code = str(item["code"])
        name = str(item["name"])
        item_meta[item_id] = (code, unit)
        prices_by_country: dict[str, tuple[str, int]] = {}
        raw_prices: list[dict[str, Any]] = list(item["prices"])
        for raw_price in raw_prices:
            rp = RegionalPrice.model_validate(raw_price)
            country = rp.country
            currency = rp.currency
            amount_minor = rp.amount_minor
            prices_by_country[country] = (currency, amount_minor)
            # Monthly SaaS plans also serve annual subscriptions at 12 x the monthly per-learner price, exactly as the
            # frozen demo invoices bill them (e.g. `inv-rv-26`: 1,460 learners x 12 months at the monthly price).
            variants: list[tuple[Interval, int]] = (
                [("monthly", amount_minor), ("yearly", amount_minor * 12)]
                if unit == "per_learner_month"
                else [("yearly", amount_minor)]
            )
            for interval, per_learner in variants:
                lago_code = plan_code_for(code, currency, interval)
                if lago_code in synced_plans:
                    continue
                plan = BillingPlan(
                    code=lago_code,
                    name=f"{name} ({currency} {interval})",
                    interval=interval,
                    currency=currency,
                    base_amount_minor=0,
                    per_learner_minor=per_learner,
                )
                try:
                    await target.upsert_plan(plan)
                except BillingUnavailable as exc:
                    raise BillingUnavailable(f"plans ({lago_code}): {exc}") from exc
                synced_plans.add(lago_code)
                plan_codes.append(lago_code)
        item_prices[item_id] = prices_by_country

    # 3. Customers (accounts with at least one trialing / active / past_due subscription)
    sub_rows = (await conn.execute(select(subscriptions).order_by(subscriptions.c.id))).mappings().all()
    acc_rows = (
        (await conn.execute(select(accounts.c.id, accounts.c.name, accounts.c.country).order_by(accounts.c.id)))
        .mappings()
        .all()
    )
    accounts_by_id = {str(r["id"]): r for r in acc_rows}

    eligible_subs: list[Any] = []
    cancelled_subs: list[str] = []
    subs_by_account: dict[str, list[Any]] = {}
    for sub in sub_rows:
        sub_id = str(sub["id"])
        status = str(sub["status"])
        if status == "cancelled":
            cancelled_subs.append(sub_id)
            continue
        if status not in ACTIVE_SUB_STATUSES:
            skipped.append(SkippedItem(sub_id, f"status {status} not synced"))
            continue
        eligible_subs.append(sub)
        subs_by_account.setdefault(str(sub["account_id"]), []).append(sub)

    synced_customer_currency: dict[str, str] = {}
    for account_id in sorted(subs_by_account):
        acc = accounts_by_id.get(account_id)
        if acc is None:
            skipped.append(SkippedItem(account_id, "account not found"))
            continue
        country = str(acc["country"])
        acc_currency: str | None = None
        for sub in subs_by_account[account_id]:
            found = item_prices.get(str(sub["plan_item_id"]), {}).get(country)
            if found is not None:
                acc_currency = found[0]
                break
        if acc_currency is None:
            skipped.append(SkippedItem(account_id, f"no regional price for country {country}"))
            continue
        customer = BillingCustomer(
            account_id=account_id,
            legal_name=str(acc["name"]),
            country=country,
            currency=acc_currency,
        )
        try:
            await target.upsert_customer(customer)
        except BillingUnavailable as exc:
            raise BillingUnavailable(f"customers ({account_id}): {exc}") from exc
        synced_customer_currency[account_id] = acc_currency
        customer_ids.append(account_id)

    # 4. Subscriptions
    synced_sub_by_tenant: dict[str, str] = {}
    for sub in eligible_subs:
        sub_id = str(sub["id"])
        account_id = str(sub["account_id"])
        if account_id not in synced_customer_currency:
            skipped.append(SkippedItem(sub_id, f"account {account_id} skipped"))
            continue
        plan_item_id = str(sub["plan_item_id"])
        acc = accounts_by_id[account_id]
        country = str(acc["country"])
        meta = item_meta.get(plan_item_id)
        price_info = item_prices.get(plan_item_id, {}).get(country)
        if meta is None or price_info is None:
            skipped.append(SkippedItem(sub_id, f"no regional price for country {country} on plan {plan_item_id}"))
            continue
        item_code, _ = meta
        sub_currency, _ = price_info
        if sub_currency != synced_customer_currency[account_id]:
            skipped.append(SkippedItem(sub_id, f"currency {sub_currency} differs from customer currency"))
            continue
        interval = _interval_for_period(str(sub["period"]))
        lago_code = plan_code_for(item_code, sub_currency, interval)
        if lago_code not in synced_plans:
            skipped.append(SkippedItem(sub_id, f"plan {lago_code} not available"))
            continue
        try:
            await target.subscribe(
                account_id,
                sub_id,
                lago_code,
                started_at=_iso_start(_billing_start(sub)),
            )
        except BillingUnavailable as exc:
            raise BillingUnavailable(f"subscriptions ({sub_id}): {exc}") from exc
        subscription_ids.append(sub_id)
        synced_sub_by_tenant[str(sub["tenant_id"])] = sub_id

    # 4b. Cancellations (NEX-111): end any cancelled subscription still active in Lago.
    terminated_ids: list[str] = []
    for sub_id in cancelled_subs:
        try:
            ended = await target.terminate(sub_id)
        except BillingUnavailable as exc:
            raise BillingUnavailable(f"cancellations ({sub_id}): {exc}") from exc
        if ended:
            terminated_ids.append(sub_id)
        else:
            skipped.append(SkippedItem(sub_id, "cancelled (already ended in Lago)"))

    # 5. Learner usage events (idempotent by usage_record.id)
    usage_rows = (
        (
            await conn.execute(
                select(usage_records).where(usage_records.c.metric == "learners").order_by(usage_records.c.id)
            )
        )
        .mappings()
        .all()
    )
    for row in usage_rows:
        rec_id = str(row["id"])
        tenant_id = row["tenant_id"]
        if tenant_id is None or str(tenant_id) not in synced_sub_by_tenant:
            skipped.append(SkippedItem(rec_id, "no synced subscription for tenant"))
            continue
        event = UsageEvent(
            transaction_id=rec_id,
            subscription_id=synced_sub_by_tenant[str(tenant_id)],
            learners=int(row["quantity"]),
            timestamp=_unix_seconds(row["period_end"]),
        )
        try:
            await target.record_usage(event)
        except BillingUnavailable as exc:
            raise BillingUnavailable(f"usage ({rec_id}): {exc}") from exc
        usage_ids.append(rec_id)

    # 6. Retry externally paid invoices whose `mark_paid` call to Lago failed earlier (NEX-107).
    unsynced = (
        await conn.execute(
            select(payments.c.id, invoices.c.lago_invoice_id)
            .join(invoices, invoices.c.id == payments.c.invoice_id)
            .where(
                payments.c.lago_synced.is_(False),
                payments.c.status == "succeeded",
                invoices.c.lago_invoice_id.is_not(None),
            )
            .order_by(payments.c.created_at, payments.c.id)
        )
    ).all()
    marked_paid: list[str] = []
    for pay_id, lago_inv_id in unsynced:
        try:
            await target.mark_paid(str(lago_inv_id))
        except BillingUnavailable as exc:
            raise BillingUnavailable(f"payments ({pay_id}): {exc}") from exc
        if not dry_run:
            await conn.execute(update(payments).where(payments.c.id == pay_id).values(lago_synced=True))
        marked_paid.append(str(pay_id))

    return SyncReport(
        dry_run=dry_run,
        plans=plan_codes,
        customers=customer_ids,
        subscriptions=subscription_ids,
        terminated=terminated_ids,
        usage_events=usage_ids,
        payments_marked_paid=marked_paid,
        skipped=skipped,
    )
