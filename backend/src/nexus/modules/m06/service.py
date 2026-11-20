"""M06 services (NEX-052): audit log reads, consents, data subject request steps and due dates.

Data subject requests move one step at a time: received → in_progress → completed | rejected. A rejection needs a
reason, which is kept on the request (the requester is told) but never written to the audit log — only the field
name is (E-3). Due dates use the strictest deadline of the tenant's compliance packs.
"""

import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext
from nexus.modules.m06.packs import dsr_due_at
from nexus.modules.m06.schemas import DataSubjectRequestOut, DsrKind, DsrStatus

NEXT: dict[str, tuple[str, ...]] = {
    "received": ("in_progress",),
    "in_progress": ("completed", "rejected"),
    "completed": (),
    "rejected": (),
}
STATUS_ACTION = {"received": "received", "in_progress": "started", "completed": "completed", "rejected": "rejected"}
OPEN = frozenset({"received", "in_progress"})
#: Contract `UtcDateTime` (`z.iso.datetime()`): `2026-09-01T00:00:00Z`, optional fraction, always `Z`.
UTC_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$")

AUDIT_SELECT = (
    "SELECT id, tenant_id, occurred_at, actor_kind, actor_id, grant_id, action, module_id, target_type, target_id, "
    "device_id, changes, prev_hash, hash FROM audit_events"
)
DSR_SELECT = (
    "SELECT id, tenant_id, person_id, kind, status, received_at, due_at, completed_at, handled_by "
    "FROM data_subject_requests"
)


def invalid(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


def instant(value: str | None, key: str) -> datetime | None:
    """`?from=` / `?to=` as a UTC instant; 400 when not one."""
    if value is None:
        return None
    if not UTC_INSTANT.fullmatch(value):
        raise invalid(key, "Must be a UTC date-time, e.g. 2026-09-01T00:00:00Z")
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise invalid(key, "Must be a UTC date-time, e.g. 2026-09-01T00:00:00Z") from exc


def audit_filter(
    action: str | None, actor_id: str | None, grant_id: str | None, since: datetime | None, until: datetime | None
) -> tuple[str, dict[str, Any]]:
    """`WHERE …` (exact matches; inclusive time bounds) and its parameters."""
    clauses: list[str] = []
    params: dict[str, Any] = {}
    for column, value in (("action", action), ("actor_id", actor_id), ("grant_id", grant_id)):
        if value is not None:
            clauses.append(f"{column} = :{column}")
            params[column] = value
    if since is not None:
        clauses.append("occurred_at >= :since")
        params["since"] = since
    if until is not None:
        clauses.append("occurred_at <= :until")
        params["until"] = until
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), params


async def pack_codes(db: AsyncSession) -> set[str]:
    return set((await db.execute(text("SELECT pack_code FROM tenant_compliance"))).scalars())


async def dsr_out(db: AsyncSession, dsr_id: str) -> DataSubjectRequestOut | None:
    row = (await db.execute(text(DSR_SELECT + " WHERE id = :id"), {"id": dsr_id})).mappings().first()
    return DataSubjectRequestOut.model_validate(dict(row)) if row else None


def is_overdue(dsr: DataSubjectRequestOut, now: datetime) -> bool:
    """Still open after its due date (the M06 screen's overdue badge)."""
    return dsr.status in OPEN and now > dsr.due_at


def step_issue(current: str, target: DsrStatus, reason: str | None) -> ApiError | None:
    """Why `current → target` is not allowed (409), or a rejection without a reason (400)."""
    if target not in NEXT[current]:
        message = f"Cannot move a {current} request to {target}"
        return ApiError(409, "conflict", message, [ApiErrorDetail(path="status", message=message)])
    if target == "rejected" and not (reason or "").strip():
        return invalid("reason", "A rejection needs a reason")
    return None


async def move_request(
    db: AsyncSession,
    ctx: TenantContext,
    user_id: str,
    dsr: DataSubjectRequestOut,
    target: DsrStatus,
    reason: str | None,
) -> DataSubjectRequestOut:
    closed = target in ("completed", "rejected")
    await db.execute(
        text(
            "UPDATE data_subject_requests SET status = :s, handled_by = :by, completed_at = :done, "
            "rejection_reason = :reason WHERE id = :id"
        ),
        {
            "s": target,
            "by": user_id,
            "done": datetime.now(UTC) if closed else None,
            "reason": reason.strip() if target == "rejected" and reason else None,
            "id": dsr.id,
        },
    )
    fields = ["status", *(["rejectionReason"] if target == "rejected" else [])]
    await record_audit(
        db,
        ctx,
        AuditInput(
            action=f"m06.dataRequest.{STATUS_ACTION[target]}",
            actor_kind="user",
            actor_id=user_id,
            target_type="dataSubjectRequest",
            target_id=dsr.id,
            changes=changes(*fields),
        ),
    )
    moved = await dsr_out(db, dsr.id)
    assert moved is not None
    return moved


async def receive_request(
    db: AsyncSession, ctx: TenantContext, person_id: str, kind: DsrKind, received_at: datetime | None = None
) -> DataSubjectRequestOut:
    """Records a new request (the self-service portal files them in Stage 2); due by the tenant's packs."""
    received = received_at or datetime.now(UTC)
    dsr_id = new_id("dsr")
    await db.execute(
        text(
            "INSERT INTO data_subject_requests (id, tenant_id, person_id, kind, status, received_at, due_at) "
            "VALUES (:id, :t, :p, :k, 'received', :at, :due)"
        ),
        {
            "id": dsr_id,
            "t": ctx.tenant_id,
            "p": person_id,
            "k": kind,
            "at": received,
            "due": dsr_due_at(received, await pack_codes(db)),
        },
    )
    await record_audit(
        db,
        ctx,
        AuditInput(
            action="m06.dataRequest.received",
            actor_kind="system",
            target_type="dataSubjectRequest",
            target_id=dsr_id,
            changes=changes("kind", "personId"),
        ),
    )
    created = await dsr_out(db, dsr_id)
    assert created is not None
    return created
