"""M06 API models: shapes of `frontend/packages/contracts/src/compliance.ts`."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from nexus.core.schemas import Contract

DsrStatus = Literal["received", "in_progress", "completed", "rejected"]
DsrKind = Literal["access", "correct", "delete", "export"]


class AuditChangeOut(Contract):
    field: str
    sensitive: bool


class AuditEventOut(Contract):
    id: str
    tenant_id: str
    occurred_at: datetime
    actor_kind: Literal["user", "system", "provider_grant"]
    actor_id: str | None
    grant_id: str | None
    action: str
    module_id: str
    target_type: str
    target_id: str | None
    device_id: str | None
    changes: list[AuditChangeOut]
    prev_hash: str | None
    hash: str


class ConsentOut(Contract):
    id: str
    tenant_id: str
    person_id: str
    purpose: Literal["ai_features", "media_sharing", "marketing", "data_processing"]
    status: Literal["granted", "withdrawn", "pending"]
    given_by_person_id: str | None
    method: Literal["form", "digital_signature", "in_app", "paper"]
    recorded_at: datetime
    withdrawn_at: datetime | None


class DataSubjectRequestOut(Contract):
    id: str
    tenant_id: str
    person_id: str
    kind: DsrKind
    status: DsrStatus
    received_at: datetime
    due_at: datetime
    completed_at: datetime | None
    handled_by: str | None


class DsrUpdateIn(Contract):
    status: DsrStatus
    reason: str | None = Field(default=None, max_length=500)
