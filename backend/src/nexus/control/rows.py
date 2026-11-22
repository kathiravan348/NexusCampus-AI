"""Row ⇄ contract conversion for control tables: dates and timestamps as the contracts write them (`YYYY-MM-DD`,
`YYYY-MM-DDTHH:MM:SSZ`), numerics as JSON numbers. One place, so every resource serialises the same way."""

from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, DateTime, Numeric, Table

from nexus.control.staff import utc_text


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def to_db(table: Table, data: Mapping[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in table.columns:
        if col.name not in data:
            continue
        value = data[col.name]
        if isinstance(value, str) and isinstance(col.type, DateTime):
            value = _parse_utc(value)
        elif isinstance(value, str) and isinstance(col.type, Date):
            value = date.fromisoformat(value)
        out[col.name] = value
    return out


def from_db(table: Table, row: Mapping[Any, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col in table.columns:
        value = row[col.name]
        if isinstance(value, datetime):
            value = utc_text(value)
        elif isinstance(value, date):
            value = value.isoformat()
        elif isinstance(value, Decimal) and isinstance(col.type, Numeric):
            value = int(value) if value == value.to_integral_value() else float(value)
        out[col.name] = value
    return out
