"""P16 business analytics on the control database (NEX-124): monthly business metrics and AI account health.

Read-only resources (`control_app` has SELECT only). Stored monthly snapshots; nothing is computed on read.
Partner scoping uses the shared `Resource` rule: `account-health` scopes by `account_id`, while `metrics` has no
account column so partners see no rows.
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter
from pydantic import Field, StringConstraints
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, mount
from nexus.control.rows import to_db
from nexus.control.staff import CurrencyCode, Id, UtcDateTime, metadata

ID = 64
_MONTH_RE = r"^[0-9]{4}-(0[1-9]|1[0-2])$"
_MESSAGE_KEY_RE = r"^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$"

Month = Annotated[str, StringConstraints(pattern=_MONTH_RE)]
MessageKey = Annotated[str, StringConstraints(pattern=_MESSAGE_KEY_RE)]

business_metrics = Table(
    "business_metrics",
    metadata,
    Column("month", String(7), primary_key=True),
    Column("currency", String(3), nullable=False),
    Column("mrr_minor", BigInteger, nullable=False),
    Column("arr_minor", BigInteger, nullable=False),
    Column("active_accounts", Integer, nullable=False),
    Column("new_accounts", Integer, nullable=False),
    Column("churned_accounts", Integer, nullable=False),
    Column("gross_churn_pct", Numeric(5, 2), nullable=False),
    Column("nrr_pct", Numeric(6, 2), nullable=False),
    Column("open_tickets", Integer, nullable=False),
    CheckConstraint(f"month ~ '{_MONTH_RE}'", name="business_metrics_month_format"),
    CheckConstraint("currency ~ '^[A-Z]{3}$'", name="business_metrics_currency_iso"),
    CheckConstraint("mrr_minor >= 0 AND arr_minor >= 0", name="business_metrics_mrr_arr_non_negative"),
    CheckConstraint("arr_minor = mrr_minor * 12", name="business_metrics_arr_eq_12_mrr"),
    CheckConstraint(
        "active_accounts >= 0 AND new_accounts >= 0 AND churned_accounts >= 0 AND open_tickets >= 0",
        name="business_metrics_counts_non_negative",
    ),
    CheckConstraint("new_accounts <= active_accounts", name="business_metrics_new_le_active"),
    CheckConstraint("gross_churn_pct >= 0 AND gross_churn_pct <= 100", name="business_metrics_churn_range"),
    CheckConstraint("nrr_pct >= 0 AND nrr_pct <= 300", name="business_metrics_nrr_range"),
)

account_health = Table(
    "account_health",
    metadata,
    Column("account_id", String(ID), ForeignKey(accounts.c.id), primary_key=True),
    Column("score", SmallInteger, nullable=False),
    Column("churn_risk", String(16), nullable=False),
    Column("reasons", ARRAY(Text), nullable=False),
    Column("ai_generated", Boolean, nullable=False),
    Column("computed_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("score BETWEEN 0 AND 100", name="account_health_score_range"),
    CheckConstraint("churn_risk IN ('low', 'medium', 'high')", name="account_health_risk_known"),
    CheckConstraint("cardinality(reasons) BETWEEN 1 AND 5", name="account_health_reasons_count"),
    CheckConstraint("ai_generated = true", name="account_health_ai_generated_true"),
    CheckConstraint("churn_risk <> 'high' OR score < 50", name="account_health_high_risk_below_50"),
    CheckConstraint("churn_risk <> 'low' OR score >= 70", name="account_health_low_risk_at_least_70"),
)


class BusinessMetrics(CamelModel):
    month: Month
    currency: CurrencyCode
    mrr_minor: Annotated[int, Field(ge=0)]
    arr_minor: Annotated[int, Field(ge=0)]
    active_accounts: Annotated[int, Field(ge=0)]
    new_accounts: Annotated[int, Field(ge=0)]
    churned_accounts: Annotated[int, Field(ge=0)]
    gross_churn_pct: Annotated[float, Field(ge=0, le=100)]
    nrr_pct: Annotated[float, Field(ge=0, le=300)]
    open_tickets: Annotated[int, Field(ge=0)]


class AccountHealth(CamelModel):
    account_id: Id
    score: Annotated[int, Field(ge=0, le=100)]
    churn_risk: Literal["low", "medium", "high"]
    reasons: Annotated[list[MessageKey], Field(min_length=1, max_length=5)]
    ai_generated: Literal[True]
    computed_at: UtcDateTime


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("metrics", business_metrics, BusinessMetrics, "month"),
    ("account_health", account_health, AccountHealth, "account_id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P16 analytics"])

METRICS = Resource("metrics", business_metrics, BusinessMetrics, "ctl.analytics.read", {}, key="month")
ACCOUNT_HEALTH = Resource(
    "account-health",
    account_health,
    AccountHealth,
    "ctl.analytics.read",
    {"churnRisk": "churn_risk"},
    key="account_id",
)

for resource in (METRICS, ACCOUNT_HEALTH):
    mount(router, resource)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo monthly metrics and account health snapshots, after accounts."""
    count = 0
    for key, table, model, pk in SEED_TABLES:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=[pk], set_={k: v for k, v in row.items() if k != pk})
            )
            count += 1
    return count
