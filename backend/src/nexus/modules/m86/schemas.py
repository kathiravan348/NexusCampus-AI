"""Frozen M86 rollover wire shapes (`frontend/packages/contracts/src/rollover.ts`, inputs added by NEX-208)."""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, Field, StrictBool, StrictInt, StringConstraints, model_validator

from nexus.core.schemas import Contract
from nexus.modules.m15.schemas import Id, Record

Action = Literal["promote", "detain", "graduate", "transfer", "skip"]
MessageKey = Annotated[
    str, StringConstraints(pattern=r"^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$")
]
Count = Annotated[StrictInt, Field(ge=0)]
STRICT_INPUT = ConfigDict(hide_input_in_errors=True, validate_by_alias=True, validate_by_name=False)


def _target_rule(action: str, target: str | None) -> bool:
    return (target is not None) == (action in {"promote", "detain"})


class RolloverCounts(Contract):
    promote: Count
    detain: Count
    graduate: Count
    transfer: Count
    skip: Count


class RolloverRunOut(Record):
    institution_id: Id
    from_academic_year_id: Id
    to_academic_year_id: Id
    status: Literal["draft", "dry_run_ready", "running", "completed", "rolled_back", "failed"]
    counts: RolloverCounts
    carry_forward_fees: StrictBool
    rollback_until: datetime | None
    created_by_staff_profile_id: Id
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def rules(self) -> Self:
        if self.to_academic_year_id == self.from_academic_year_id:
            raise ValueError("toAcademicYearId must differ from fromAcademicYearId")
        if (self.rollback_until is not None) != (self.status == "completed"):
            raise ValueError("rollbackUntil must be set iff status is completed")
        if self.updated_at < self.created_at:
            raise ValueError("updatedAt is before createdAt")
        return self


class PromotionDecisionOut(Record):
    run_id: Id
    learner_id: Id
    action: Action
    to_class_group_id: Id | None
    reason_key: MessageKey | None
    overridden_by_staff_profile_id: Id | None

    @model_validator(mode="after")
    def rules(self) -> Self:
        if not _target_rule(self.action, self.to_class_group_id):
            raise ValueError("toClassGroupId must be set iff action is promote or detain")
        return self


class RolloverRunIn(Contract):
    model_config = STRICT_INPUT

    institution_id: Id
    from_academic_year_id: Id
    to_academic_year_id: Id
    carry_forward_fees: StrictBool

    def rule_path(self) -> str | None:
        return "toAcademicYearId" if self.to_academic_year_id == self.from_academic_year_id else None


class PromotionDecisionIn(Contract):
    model_config = STRICT_INPUT

    action: Action
    to_class_group_id: Id | None
    reason_key: MessageKey | None

    def rule_path(self) -> str | None:
        return None if _target_rule(self.action, self.to_class_group_id) else "toClassGroupId"
