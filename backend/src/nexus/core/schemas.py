"""Base for API models: strict (unknown keys rejected), camelCase JSON, contract time text (`…:00Z`)."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_serializer
from pydantic.alias_generators import to_camel

from nexus.core.hashchain import format_instant


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True, frozen=True)

    @field_serializer("*", when_used="json")
    def _instants(self, value: Any) -> Any:
        # Contract `UtcDateTime`: `2026-05-04T06:00:00Z`; `IsoDate`: `2026-05-04`.
        if isinstance(value, datetime):
            return format_instant(value)
        if isinstance(value, date):
            return value.isoformat()
        return value
