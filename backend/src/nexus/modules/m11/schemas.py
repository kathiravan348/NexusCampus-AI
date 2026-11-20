"""M11 API models: `AiSettings`, `AiCredit`, `AssistAnswer` (`contracts/src/ai.ts`) and the mock's inputs."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import StringConstraints

from nexus.core.schemas import Contract

TierName = Literal["fast", "balanced", "reasoning", "embedding", "multimodal"]
ModuleId = Annotated[str, StringConstraints(pattern=r"^[MP](0[1-9]|[1-9]\d)$")]


class ProviderOut(Contract):
    kind: Literal["cloud", "local"]
    label: str


class AiSettingsOut(Contract):
    tenant_id: str
    enabled: bool
    modules: dict[str, bool]
    blocked_modules: list[str]
    safeguarding_enabled: bool
    pii_redaction: Literal[True]
    minor_guardian_consent_required: Literal[True]
    default_tier: TierName
    provider: ProviderOut
    updated_at: datetime


class AiSettingsIn(Contract):
    enabled: bool
    modules: dict[ModuleId, bool]
    safeguarding_enabled: bool
    default_tier: TierName


class AiCreditOut(Contract):
    tenant_id: str
    period_start: datetime
    period_end: datetime
    granted: int
    used: int
    hard_cap: bool


class SourceOut(Contract):
    module_id: str
    record_type: str
    record_id: str
    label: str


class AssistAnswerOut(Contract):
    id: str
    tenant_id: str
    question: str
    answer: str
    locale: str
    ai_generated: Literal[True]
    sources: list[SourceOut]
    tier: TierName
    credits_used: int
    created_at: datetime


class AskIn(Contract):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    locale: str


class AskOut(Contract):
    answer: AssistAnswerOut | None
    credits: AiCreditOut
