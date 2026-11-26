"""Frozen M25-M28 home and KPI wire shapes (`frontend/packages/contracts/src/homes.ts`).

Home cards and KPIs carry counts and aggregates only, never other people's personal data (G-6, V-7).
"""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import Field, StrictInt, StringConstraints, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id

CardKind = Literal[
    "attendance",
    "fees",
    "results",
    "timetable",
    "messages",
    "notices",
    "consents",
    "pickups",
    "leave",
    "payslips",
    "tasks",
    "kpi",
    "alerts",
]
MessageKey = Annotated[
    str, StringConstraints(pattern=r"^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$")
]


class HomeCard(Contract):
    kind: CardKind
    title_key: MessageKey
    module_id: Annotated[str, StringConstraints(pattern=r"^[MP](0[1-9]|[1-9]\d)$")]
    count: Annotated[StrictInt, Field(ge=0)] | None
    severity: Literal["info", "warning", "critical"] | None
    href: Annotated[str, StringConstraints(max_length=200, pattern=r"^/[a-z0-9/-]*$")]


class RoleHomeOut(Contract):
    role: Literal["family", "learner", "staff", "leader"]
    person_id: Id
    learner_ids: Annotated[list[Id], Field(max_length=10)]
    cards: Annotated[list[HomeCard], Field(min_length=1, max_length=24)]
    generated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if len(set(self.learner_ids)) != len(self.learner_ids):
            raise ValueError("learnerIds has duplicates")
        if self.role in {"staff", "leader"} and self.learner_ids:
            raise ValueError("learnerIds must be empty for staff and leader homes")
        if any(card.href.startswith("//") for card in self.cards):
            raise ValueError("href must be an app path")
        return self


class KpiOut(Contract):
    code: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{2,39}$")]
    label_key: MessageKey
    value: float | int
    unit: Literal["count", "percent", "minor_units", "days"]
    currency: str | None
    trend: Literal["up", "down", "flat"] | None
    as_of: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.unit == "minor_units" and not float(self.value).is_integer():
            raise ValueError("value must be an integer when unit is minor_units")
        return self
