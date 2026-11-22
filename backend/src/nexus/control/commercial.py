"""P02 catalogue & quotes, P03 billing, P11 usage on the control database (NEX-102).

Same shapes as `@nexus/contracts` control/pricing.ts, billing.ts and usage.ts. Nested lists (regional prices, quote and
invoice lines) are JSONB, validated by the models on the way in and out. Only commercial metadata and counts (V-7);
payments carry a reference, never card or bank details. Billing never deletes data (D23).
"""

import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, engine_of, get_one, mount
from nexus.control.rows import from_db
from nexus.control.staff import metadata, staff_users
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError, ApiErrorDetail

ID = 64

catalogue_items = Table(
    "catalogue_items",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("code", String(64), nullable=False, unique=True),
    Column("name", String(200), nullable=False),
    Column("kind", String(24), nullable=False),
    Column("modules", ARRAY(Text), nullable=False),
    Column("unit", String(24), nullable=False),
    Column("credits", Integer, nullable=True),
    Column("prices", JSONB, nullable=False),
    Column("active", Boolean, nullable=False),
    CheckConstraint("(kind = 'ai_credit_pack') = (credits IS NOT NULL)", name="catalogue_credits_only_for_packs"),
)

quotes = Table(
    "quotes",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("number", String(32), nullable=False, unique=True),
    Column("status", String(16), nullable=False),
    Column("currency", String(3), nullable=False),
    Column("lines", JSONB, nullable=False),
    Column("subtotal_minor", BigInteger, nullable=False),
    Column("tax_minor", BigInteger, nullable=False),
    Column("total_minor", BigInteger, nullable=False),
    Column("valid_until", Date, nullable=False),
    Column("ai_drafted", Boolean, nullable=False),
    Column("created_by_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("total_minor = subtotal_minor + tax_minor", name="quotes_totals_add_up"),
)

subscriptions = Table(
    "subscriptions",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=False),
    Column("plan_item_id", String(ID), ForeignKey(catalogue_items.c.id), nullable=False),
    Column("addon_item_ids", ARRAY(Text), nullable=False),
    Column("status", String(16), nullable=False),
    Column("period", String(8), nullable=False),
    Column("learners", Integer, nullable=False),
    Column("current_period_start", Date, nullable=False),
    Column("current_period_end", Date, nullable=False),
    Column("trial_ends_at", Date, nullable=True),
    CheckConstraint("(status = 'trialing') = (trial_ends_at IS NOT NULL)", name="subscriptions_trial_end_iff_trial"),
)

invoices = Table(
    "invoices",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("number", String(32), nullable=False, unique=True),
    Column("status", String(8), nullable=False),
    Column("issue_date", Date, nullable=False),
    Column("due_date", Date, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("tax_scheme", String(8), nullable=False),
    Column("lines", JSONB, nullable=False),
    Column("subtotal_minor", BigInteger, nullable=False),
    Column("tax_minor", BigInteger, nullable=False),
    Column("total_minor", BigInteger, nullable=False),
    Column("paid_at", DateTime(timezone=True), nullable=True),
    CheckConstraint("total_minor = subtotal_minor + tax_minor", name="invoices_totals_add_up"),
    CheckConstraint("(status = 'paid') = (paid_at IS NOT NULL)", name="invoices_paid_at_iff_paid"),
    CheckConstraint("due_date >= issue_date", name="invoices_due_after_issue"),
)

payments = Table(
    "payments",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("invoice_id", String(ID), ForeignKey(invoices.c.id), nullable=False, index=True),
    Column("amount_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("method", String(16), nullable=False),
    Column("gateway", String(16), nullable=False),
    Column("gateway_ref", String(128), nullable=True),
    Column("status", String(16), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("gateway = 'manual' OR gateway_ref IS NOT NULL", name="payments_gateway_needs_ref"),
)

credit_notes = Table(
    "credit_notes",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("invoice_id", String(ID), ForeignKey(invoices.c.id), nullable=False, index=True),
    Column("number", String(32), nullable=False, unique=True),
    Column("amount_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("reason", String(500), nullable=False),
    Column("issued_at", DateTime(timezone=True), nullable=False),
)

dunning_states = Table(
    "dunning_states",
    metadata,
    Column("account_id", String(ID), ForeignKey(accounts.c.id), primary_key=True),
    Column("stage", String(16), nullable=False),
    Column("overdue_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("next_step_at", DateTime(timezone=True), nullable=True),
)

usage_records = Table(
    "usage_records",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("deployment_id", String(ID), nullable=True),
    Column("tenant_id", String(ID), nullable=True),
    Column("metric", String(16), nullable=False),
    Column("period_start", DateTime(timezone=True), nullable=False),
    Column("period_end", DateTime(timezone=True), nullable=False),
    Column("quantity", BigInteger, nullable=False),
    Column("cap", BigInteger, nullable=True),
    CheckConstraint("deployment_id IS NOT NULL OR tenant_id IS NOT NULL", name="usage_belongs_somewhere"),
    CheckConstraint("period_end > period_start", name="usage_period_order"),
)


class RegionalPrice(CamelModel):
    country: str
    currency: str
    amount_minor: int
    tax_rate_pct: float


class CatalogueItem(CamelModel):
    id: str
    code: str
    name: str
    kind: Literal["saas_plan", "addon", "ai_credit_pack", "licence_edition", "support"]
    modules: list[str]
    unit: Literal["per_learner_month", "per_learner_year", "flat_month", "flat_year", "per_pack"]
    credits: int | None
    prices: list[RegionalPrice]
    active: bool


class QuoteLine(CamelModel):
    item_id: str
    quantity: int
    unit_amount_minor: int
    discount_pct: float
    amount_minor: int


class Quote(CamelModel):
    id: str
    account_id: str
    number: str
    status: Literal["draft", "sent", "accepted", "expired"]
    currency: str
    lines: list[QuoteLine]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    valid_until: str
    ai_drafted: bool
    created_by_staff_id: str
    created_at: str


class Subscription(CamelModel):
    id: str
    account_id: str
    tenant_id: str
    plan_item_id: str
    addon_item_ids: list[str]
    status: Literal["trialing", "active", "past_due", "cancelled"]
    period: Literal["monthly", "annual"]
    learners: int
    current_period_start: str
    current_period_end: str
    trial_ends_at: str | None


class InvoiceLine(CamelModel):
    description: str
    item_id: str | None
    quantity: int
    amount_minor: int


class Invoice(CamelModel):
    id: str
    account_id: str
    number: str
    status: Literal["draft", "open", "paid", "overdue", "void"]
    issue_date: str
    due_date: str
    currency: str
    tax_scheme: Literal["gst", "vat", "none"]
    lines: list[InvoiceLine]
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    paid_at: str | None


class Payment(CamelModel):
    id: str
    invoice_id: str
    amount_minor: int
    currency: str
    method: Literal["card", "upi", "netbanking", "bank_transfer"]
    gateway: Literal["razorpay", "stripe", "manual"]
    gateway_ref: str | None
    status: Literal["pending", "succeeded", "failed", "refunded"]
    created_at: str


class CreditNote(CamelModel):
    id: str
    invoice_id: str
    number: str
    amount_minor: int
    currency: str
    reason: str
    issued_at: str


class DunningState(CamelModel):
    account_id: str
    stage: Literal["none", "reminder_1", "reminder_2", "final_notice", "read_only"]
    overdue_minor: int
    currency: str
    next_step_at: str | None


class UsageRecord(CamelModel):
    id: str
    account_id: str
    deployment_id: str | None
    tenant_id: str | None
    metric: Literal["learners", "staff", "storage_gb", "ai_credits", "messages"]
    period_start: str
    period_end: str
    quantity: int
    cap: int | None


#: Seed order (foreign keys): fixture key, table, model, primary key column.
SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("catalogue", catalogue_items, CatalogueItem, "id"),
    ("quotes", quotes, Quote, "id"),
    ("subscriptions", subscriptions, Subscription, "id"),
    ("invoices", invoices, Invoice, "id"),
    ("payments", payments, Payment, "id"),
    ("credit_notes", credit_notes, CreditNote, "id"),
    ("dunning", dunning_states, DunningState, "account_id"),
    ("usage", usage_records, UsageRecord, "id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P02 P03 P11 commercial"])

CATALOGUE = Resource("catalogue", catalogue_items, CatalogueItem, "ctl.quote.read", {"kind": "kind"})
QUOTES = Resource("quotes", quotes, Quote, "ctl.quote.read", {"accountId": "account_id", "status": "status"})
SUBSCRIPTIONS = Resource(
    "subscriptions", subscriptions, Subscription, "ctl.billing.read", {"accountId": "account_id", "status": "status"}
)
INVOICES = Resource("invoices", invoices, Invoice, "ctl.billing.read", {"accountId": "account_id", "status": "status"})
PAYMENTS = Resource(
    "payments", payments, Payment, "ctl.billing.read", {"invoiceId": "invoice_id", "status": "status"}, None
)
CREDIT_NOTES = Resource("credit-notes", credit_notes, CreditNote, "ctl.billing.read", {"invoiceId": "invoice_id"}, None)
DUNNING = Resource(
    "dunning",
    dunning_states,
    DunningState,
    "ctl.billing.read",
    {"stage": "stage"},
    "account_id",
    order=dunning_states.c.account_id,
)
USAGE = Resource(
    "usage",
    usage_records,
    UsageRecord,
    "ctl.usage.read",
    {"accountId": "account_id", "metric": "metric", "tenantId": "tenant_id", "deploymentId": "deployment_id"},
    None,
)

for resource in (CATALOGUE, QUOTES, SUBSCRIPTIONS, INVOICES, PAYMENTS, CREDIT_NOTES, DUNNING, USAGE):
    mount(router, resource)


class _Body(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class SendQuote(CamelModel):
    checked_by_human: bool | None = None


class RecordTransfer(_Body):
    #: Our bank-statement reference, never an account number.
    reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=64)]


class TransferResult(CamelModel):
    invoice: Invoice
    payment: Payment


def _conflict() -> ApiError:
    return ApiError(409, "conflict", "That is no longer possible in its current state.")


@router.post("/quotes/{quote_id}/send", response_model=Quote)
async def send_quote(
    request: Request,
    viewer: Annotated[Viewer, Depends(require("ctl.quote.manage"))],
    quote_id: str,
    body: SendQuote | None = None,
) -> Any:
    """Draft → sent. An AI-drafted quote needs a person to confirm they checked it (A-1, D14)."""
    quote = await get_one(request, QUOTES, viewer, quote_id)
    assert isinstance(quote, Quote)
    if quote.status != "draft":
        raise _conflict()
    if quote.ai_drafted and not (body and body.checked_by_human is True):
        raise ApiError(
            400,
            "invalid_request",
            "An AI-drafted quote must be checked by a person.",
            [ApiErrorDetail(path="checkedByHuman", message="An AI-drafted quote must be checked by a person.")],
        )
    async with engine_of(request).begin() as conn:
        done = await conn.execute(
            update(quotes).where(quotes.c.id == quote_id, quotes.c.status == "draft").values(status="sent")
        )
        if done.rowcount != 1:  # sent by someone else in the meantime
            raise _conflict()
    return quote.model_copy(update={"status": "sent"})


@router.post("/invoices/{invoice_id}/record-transfer", response_model=TransferResult)
async def record_transfer(
    request: Request,
    viewer: Annotated[Viewer, Depends(require("ctl.billing.manage"))],
    invoice_id: str,
    body: RecordTransfer,
) -> Any:
    """A bank transfer we received pays the invoice in full: one `manual` payment with our statement reference,
    the invoice becomes paid, the account's dunning clears and past-due subscriptions become active."""
    invoice = await get_one(request, INVOICES, viewer, invoice_id)
    assert isinstance(invoice, Invoice)
    if invoice.status not in ("open", "overdue"):
        raise _conflict()
    now = datetime.now(UTC).replace(microsecond=0)
    payment_row: dict[str, Any] = {
        "id": "pay-manual-" + secrets.token_hex(6),
        "invoice_id": invoice.id,
        "amount_minor": invoice.total_minor,
        "currency": invoice.currency,
        "method": "bank_transfer",
        "gateway": "manual",
        "gateway_ref": body.reference,
        "status": "succeeded",
        "created_at": now,
    }
    async with engine_of(request).begin() as conn:
        paid = await conn.execute(
            update(invoices)
            .where(invoices.c.id == invoice.id, invoices.c.status.in_(["open", "overdue"]))
            .values(status="paid", paid_at=now)
        )
        if paid.rowcount != 1:
            raise _conflict()
        await conn.execute(payments.insert().values(payment_row))
        await conn.execute(
            update(dunning_states)
            .where(dunning_states.c.account_id == invoice.account_id)
            .values(stage="none", overdue_minor=0, next_step_at=None)
        )
        await conn.execute(
            update(subscriptions)
            .where(subscriptions.c.account_id == invoice.account_id, subscriptions.c.status == "past_due")
            .values(status="active")
        )
        row = (await conn.execute(select(invoices).where(invoices.c.id == invoice.id))).mappings().one()
    return TransferResult(
        invoice=Invoice.model_validate(from_db(invoices, row)),
        payment=Payment.model_validate(from_db(payments, payment_row)),
    )


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts the commercial tables from the exported fixtures, in foreign-key order."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from nexus.control.rows import to_db

    count = 0
    for key, table, model, pk in SEED_TABLES:
        for raw in data.get(key, []):
            dumped = model.model_validate(raw).model_dump()
            row = to_db(table, dumped)
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=[pk], set_={k: v for k, v in row.items() if k != pk})
            )
            count += 1
    return count
