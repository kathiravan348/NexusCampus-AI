"""M10 services (NEX-057): device rows, visibility, conflicts (recorded by modules' merge rules), audit."""

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.ids import new_id
from nexus.core.permissions import Authorized
from nexus.core.schemas import Contract
from nexus.core.tenancy import TenantContext

WIPE = "m10.device.wipe"
MergeRule = Literal["lww-audited", "append-only", "manual-review-only"]
DEVICE_SELECT = (
    "SELECT id, tenant_id, user_id, label, platform, last_sync_at, pending_count, conflict_count, lost_write_count, "
    "status, revoked_at FROM devices"
)
CONFLICT_SELECT = (
    "SELECT id, tenant_id, device_id, module_id, operation, merge_rule, summary_key, client_version, server_version, "
    "status, resolution, created_at, resolved_at FROM sync_conflicts"
)


class DeviceOut(Contract):
    id: str
    tenant_id: str
    user_id: str
    label: str
    platform: Literal["web", "android", "ios", "edge"]
    last_sync_at: datetime | None
    pending_count: int
    conflict_count: int
    lost_write_count: int
    status: Literal["active", "revoke_pending", "revoked"]
    revoked_at: datetime | None


class ConflictOut(Contract):
    id: str
    tenant_id: str
    device_id: str
    module_id: str
    operation: str
    merge_rule: MergeRule
    summary_key: str
    client_version: int
    server_version: int
    status: Literal["open", "resolved"]
    resolution: Literal["keep_server", "keep_client", "merged"] | None
    created_at: datetime
    resolved_at: datetime | None


def visible(auth: Authorized) -> tuple[str, dict[str, str]]:
    """Device managers (`m10.device.wipe`) see every device of the tenant; others only their own."""
    if auth.grants.has(WIPE):
        return "", {}
    return " WHERE user_id = :me", {"me": auth.ctx.user_id}


async def device_out(db: AsyncSession, device_id: str) -> DeviceOut | None:
    row = (await db.execute(text(DEVICE_SELECT + " WHERE id = :id"), {"id": device_id})).mappings().first()
    return DeviceOut.model_validate(dict(row)) if row else None


async def audit(
    db: AsyncSession, ctx: TenantContext, actor: str, action: str, target: tuple[str, str], fields: list[str]
) -> None:
    await record_audit(
        db,
        ctx,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=actor,
            target_type=target[0],
            target_id=target[1],
            changes=changes(*fields),
        ),
    )


async def record_conflict(
    db: AsyncSession,
    ctx: TenantContext,
    device_id: str,
    *,
    module_id: str,
    operation: str,
    merge_rule: MergeRule,
    summary_key: str,
    client_version: int,
    server_version: int,
) -> str:
    """A write a module's merge rule could not apply automatically. No payload is ever stored (privacy)."""
    conflict_id = new_id("scf")
    await db.execute(
        text(
            "INSERT INTO sync_conflicts (id, tenant_id, device_id, module_id, operation, merge_rule, summary_key, "
            "client_version, server_version, status, created_at) VALUES (:id, :t, :d, :m, :op, :rule, :key, :cv, :sv, "
            "'open', :at)"
        ),
        {
            "id": conflict_id,
            "t": ctx.tenant_id,
            "d": device_id,
            "m": module_id,
            "op": operation,
            "rule": merge_rule,
            "key": summary_key,
            "cv": client_version,
            "sv": server_version,
            "at": datetime.now(UTC),
        },
    )
    await db.execute(text("UPDATE devices SET conflict_count = conflict_count + 1 WHERE id = :d"), {"d": device_id})
    return conflict_id
