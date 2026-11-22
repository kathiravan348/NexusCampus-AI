"""`BillingEngine`: what Nexus Control needs from a billing engine (D51), independent of Lago.

Only commercial metadata crosses this boundary: our account id, the account's legal name, country and currency, plan
codes and **counts** (active learners). Never a person, a learner record or any institution data (V-7).
"""

from dataclasses import dataclass, field
from typing import Literal, Protocol

Interval = Literal["monthly", "yearly"]

#: The per-learner unit (D52): the highest number of active learners reported in the billing period.
LEARNER_METRIC = "active_learners"


class BillingUnavailable(Exception):
    """The engine could not be reached or refused the request; the caller retries or reports it."""


@dataclass(frozen=True)
class BillingCustomer:
    account_id: str
    legal_name: str
    country: str  # ISO 3166-1 alpha-2
    currency: str  # ISO 4217


@dataclass(frozen=True)
class BillingPlan:
    code: str
    name: str
    interval: Interval
    currency: str
    base_amount_minor: int
    #: Price of one active learner per interval, in minor units (D52 bands come later as graduated charges).
    per_learner_minor: int


@dataclass(frozen=True)
class UsageEvent:
    #: Idempotency key: the same id is counted once, however often it is sent.
    transaction_id: str
    subscription_id: str
    learners: int
    timestamp: int  # Unix seconds


@dataclass(frozen=True)
class CurrentUsage:
    subscription_id: str
    currency: str
    amount_minor: int
    learners: int


@dataclass(frozen=True)
class Invoice:
    id: str
    number: str
    status: str
    currency: str
    total_minor: int


class BillingEngine(Protocol):
    async def ensure_learner_metric(self) -> None: ...
    async def upsert_customer(self, customer: BillingCustomer) -> None: ...
    async def upsert_plan(self, plan: BillingPlan) -> None: ...
    async def subscribe(
        self, account_id: str, subscription_id: str, plan_code: str, *, started_at: str | None = None
    ) -> None: ...
    async def record_usage(self, event: UsageEvent) -> None: ...
    async def current_usage(self, account_id: str, subscription_id: str) -> CurrentUsage: ...
    async def invoices(self, account_id: str) -> list[Invoice]: ...


@dataclass
class FakeBillingEngine:
    """In memory, for tests and screens without Lago."""

    customers: dict[str, BillingCustomer] = field(default_factory=dict)
    plans: dict[str, BillingPlan] = field(default_factory=dict)
    subscriptions: dict[str, tuple[str, str]] = field(default_factory=dict)
    events: dict[str, UsageEvent] = field(default_factory=dict)
    metric: bool = False

    async def ensure_learner_metric(self) -> None:
        self.metric = True

    async def upsert_customer(self, customer: BillingCustomer) -> None:
        self.customers[customer.account_id] = customer

    async def upsert_plan(self, plan: BillingPlan) -> None:
        self.plans[plan.code] = plan

    async def subscribe(
        self, account_id: str, subscription_id: str, plan_code: str, *, started_at: str | None = None
    ) -> None:
        if account_id not in self.customers or plan_code not in self.plans:
            raise BillingUnavailable("unknown customer or plan")
        self.subscriptions[subscription_id] = (account_id, plan_code)

    async def record_usage(self, event: UsageEvent) -> None:
        self.events.setdefault(event.transaction_id, event)

    async def current_usage(self, account_id: str, subscription_id: str) -> CurrentUsage:
        _, code = self.subscriptions[subscription_id]
        plan = self.plans[code]
        learners = max((e.learners for e in self.events.values() if e.subscription_id == subscription_id), default=0)
        return CurrentUsage(subscription_id, plan.currency, learners * plan.per_learner_minor, learners)

    async def invoices(self, account_id: str) -> list[Invoice]:
        return []
