"""Module switches (ARCHITECTURE §6, ideology §2.2: off = hidden, never broken). A module is on for a tenant
when its entitlement row is enabled and not expired; core modules are always on (database CHECK). No row = not
in the plan = off. Plan and switch endpoints come in NEX-055.
"""

from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.errors import ApiError


async def module_enabled(db: AsyncSession, tenant_id: str, module: str) -> bool:
    row = (
        await db.execute(
            text("SELECT enabled, expires_at FROM entitlements WHERE tenant_id = :t AND module_id = :m"),
            {"t": tenant_id, "m": module},
        )
    ).one_or_none()
    if row is None or not row.enabled:
        return False
    return row.expires_at is None or row.expires_at > datetime.now(UTC)


async def ensure_module_enabled(db: AsyncSession, tenant_id: str, module: str) -> None:
    if not await module_enabled(db, tenant_id, module):
        raise ApiError(403, "module_disabled", "This module is not switched on for your institution.")
