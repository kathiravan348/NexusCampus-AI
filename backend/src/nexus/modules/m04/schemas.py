"""M04 API models: `TextOverride`, `TextOverrideRevision` (`contracts/src/studio.ts`) and the mock's inputs and
results (`handlers/m04Store.ts`)."""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field, StringConstraints

from nexus.core.schemas import Contract
from nexus.modules.m03.schemas import ScopeOut

MessageBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
RejectionReason = Literal["unknown_key", "invalid_icu", "empty_message", "locked_by_group", "invalid_value"]


class TextOverrideOut(Contract):
    id: str
    tenant_id: str
    scope: ScopeOut
    locale: str
    key: str
    message: str
    version: int
    updated_by: str
    updated_at: datetime


class RevisionOut(Contract):
    override_id: str
    version: int
    message: str | None
    changed_by: str
    changed_at: datetime


class SaveIn(Contract):
    message: MessageBody


class RollbackIn(Contract):
    version: int = Field(ge=1)


class ImportIn(Contract):
    locale: str
    entries: dict[str, Any]
    dry_run: bool = False


class DeleteOut(Contract):
    deleted: Literal[True]
    key: str
    locale: str
    version: int


class RollbackOut(Contract):
    override: TextOverrideOut | None
    revision: RevisionOut


class DiffEntry(Contract):
    key: str
    before: str | None
    after: str


class RejectedEntry(Contract):
    key: str
    reason: RejectionReason
    message: str


class ImportResult(Contract):
    dry_run: bool
    locale: str
    added: list[DiffEntry]
    changed: list[DiffEntry]
    unchanged: list[str]
    rejected: list[RejectedEntry]
    applied_count: int


class TextBundle(Contract):
    """Overrides only, per layer, for one locale; the app merges them with its catalogues (cached by `etag`)."""

    locale: str
    etag: str
    group: dict[str, str]
    institutions: dict[str, dict[str, str]]
    campuses: dict[str, dict[str, str]]
