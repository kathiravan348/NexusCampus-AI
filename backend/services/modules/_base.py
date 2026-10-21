"""
Shared helpers for module routers.
- Strict request models (unknown fields rejected).
- Dynamic WHERE builder with safe positional parameters.
- Institution settings, current term and school-day helpers.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from ..common import db
from ..common.errors import not_found


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def today() -> date:
    return date.today()


class Where:
    """Build `a AND b` conditions. Use {0}, {1}… in a condition for the values passed to add()."""

    def __init__(self, *base: str):
        self.conds: list[str] = list(base)
        self.args: list[Any] = []

    def add(self, cond: str, *values) -> "Where":
        placeholders = []
        for value in values:
            self.args.append(value)
            placeholders.append(f"${len(self.args)}")
        self.conds.append(cond.format(*placeholders))
        return self

    def arg(self, value) -> str:
        self.args.append(value)
        return f"${len(self.args)}"

    def sql(self) -> str:
        return " AND ".join(f"({c})" for c in self.conds) if self.conds else "TRUE"


def paged(items: list, total: int, page: int, page_size: int) -> dict:
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def must(row: Optional[dict], entity: str = "Record") -> dict:
    if not row:
        raise not_found(entity)
    return row


async def institution(conn) -> dict:
    return await db.fetch_one(conn, "SELECT * FROM institution WHERE deleted_at IS NULL LIMIT 1") or {}


async def current_term(conn) -> Optional[dict]:
    return await db.fetch_one(conn, """
        SELECT t.*, ay.name AS academic_year_name, ay.status AS academic_year_status
        FROM terms t JOIN academic_years ay ON ay.id = t.academic_year_id
        WHERE t.deleted_at IS NULL
        ORDER BY (CURRENT_DATE BETWEEN t.start_date AND t.end_date) DESC,
                 (t.start_date > CURRENT_DATE) DESC,
                 abs(t.start_date - CURRENT_DATE)
        LIMIT 1""")


async def holiday_dates(conn, start: date, end: date) -> set[date]:
    rows = await conn.fetch("SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN $1 AND $2 AND deleted_at IS NULL",
                            start, end)
    return {r[0] for r in rows}


async def school_days(conn, start: date, end: date) -> int:
    holidays = await holiday_dates(conn, start, end)
    count, d = 0, start
    while d <= end:
        if d.isoweekday() <= 5 and d not in holidays:
            count += 1
        d += timedelta(days=1)
    return count


async def date_in_closed_year(conn, d: date) -> bool:
    return bool(await conn.fetchval("""SELECT 1 FROM academic_years WHERE status = 'closed' AND deleted_at IS NULL
                                       AND $1 BETWEEN start_date AND end_date""", d))


def pct(numerator, denominator) -> Optional[float]:
    return round(100.0 * float(numerator) / float(denominator), 1) if denominator else None
