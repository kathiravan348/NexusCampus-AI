"""Usage meters (NEX-055, M05): the tenant's latest billing period.

Learners and staff are counted live from role profiles (D16: totals match rows); their limits come from the plan
(learners) or are open (staff). AI credits use `ai_credits_used`, which the AI gateway (NEX-058) will feed — until
then it returns the stored value; the plan sets their limit. Storage, SMS and email are the stored counters.
"""

from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.schemas import Contract

Metric = Literal["learners", "staff", "storage_bytes", "ai_credits", "sms", "email"]
ORDER: tuple[Metric, ...] = ("learners", "staff", "storage_bytes", "ai_credits", "sms", "email")
LIVE: dict[str, str] = {"learners": "learner", "staff": "staff"}


class UsageMeterOut(Contract):
    tenant_id: str
    metric: Metric
    used: int
    limit: int | None
    period_start: datetime
    period_end: datetime


def current_period(now: datetime | None = None) -> tuple[datetime, datetime]:
    """This calendar month in UTC (used when the tenant has no stored period yet)."""
    at = now or datetime.now(UTC)
    start = datetime(at.year, at.month, 1, tzinfo=UTC)
    end = (start + timedelta(days=32)).replace(day=1)
    return start, end


async def ai_credits_used(db: AsyncSession, stored: int) -> int:
    """AI credits spent this period. NEX-058 replaces this with the gateway's own count."""
    return stored


async def read_meters(
    db: AsyncSession, tenant_id: str, learner_limit: int | None, ai_limit: int
) -> list[UsageMeterOut]:
    period = (
        await db.execute(text("SELECT period_start, period_end FROM usage_meters ORDER BY period_start DESC LIMIT 1"))
    ).first()
    start, end = (period[0], period[1]) if period else current_period()
    stored = {
        r.metric: (int(r.used), r.limit)
        for r in await db.execute(
            text('SELECT metric, used, "limit" FROM usage_meters WHERE period_start = :s'), {"s": start}
        )
    }
    live = {
        kind: int(n)
        for kind, n in await db.execute(
            text("SELECT kind, count(*) FROM role_profiles WHERE kind IN ('learner', 'staff') GROUP BY kind")
        )
    }
    meters = []
    for metric in ORDER:
        used, limit = stored.get(metric, (0, None))
        if metric in LIVE:
            used = live.get(LIVE[metric], 0)
            limit = learner_limit if metric == "learners" else None
        elif metric == "ai_credits":
            used, limit = await ai_credits_used(db, used), ai_limit
        elif metric not in stored:
            continue  # a counter the tenant never used this period is not shown (as in the mock)
        meters.append(
            UsageMeterOut(
                tenant_id=tenant_id, metric=metric, used=used, limit=limit, period_start=start, period_end=end
            )
        )
    return meters
