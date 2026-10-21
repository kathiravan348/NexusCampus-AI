"""
Audit log writer (Build Spec §1.4, §3.3).
- Append-only table; UPDATE/DELETE blocked by DB trigger and grants.
- `before`/`after` store only the changed fields when both are given.
"""
import uuid
from typing import Any, Optional

from .db import jsonable

_IGNORED_FIELDS = {"updated_at", "version", "updated_by"}


class SystemCtx:
    """Actor for scheduler jobs and system-initiated events."""
    user_id = None
    role = "system"
    impersonator_id = None
    ip = None
    device = "scheduler"
    source = "system"
    staff_id = None
    student_id = None
    guardian_id = None
    linked_student_ids: list = []

    def __init__(self, tenant: Optional[dict] = None):
        self.request_id = str(uuid.uuid4())
        self.tenant = tenant or {}
        self.name = "System"

    def has(self, *_perms) -> bool:
        return True


def diff(before: dict, after: dict) -> tuple[dict, dict]:
    b, a = jsonable(before or {}), jsonable(after or {})
    keys = [k for k in sorted(set(b) | set(a)) if k not in _IGNORED_FIELDS and b.get(k) != a.get(k)]
    return {k: b.get(k) for k in keys}, {k: a.get(k) for k in keys}


async def audit(conn, ctx, event_code: str, entity_type: Optional[str] = None, entity_id: Any = None, *,
                before: Optional[dict] = None, after: Optional[dict] = None, reason: Optional[str] = None,
                source: Optional[str] = None) -> None:
    if before is not None and after is not None:
        before, after = diff(before, after)
    else:
        before = jsonable(before) if before is not None else None
        after = jsonable(after) if after is not None else None
    actor_id = getattr(ctx, "user_id", None)
    await conn.execute(
        """INSERT INTO audit_log (event_code, actor_id, actor_type, actor_role, impersonator_id, entity_type,
                                  entity_id, before, after, reason, ip, device, source, request_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
        event_code, actor_id, "user" if actor_id else "system", getattr(ctx, "role", "system"),
        getattr(ctx, "impersonator_id", None), entity_type, str(entity_id) if entity_id is not None else None,
        before, after, reason, getattr(ctx, "ip", None), getattr(ctx, "device", None),
        source or getattr(ctx, "source", "manual"), getattr(ctx, "request_id", None))
