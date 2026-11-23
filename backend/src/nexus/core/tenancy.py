"""Tenant context (ARCHITECTURE §6): every tenant query runs in a transaction that set `app.tenant_id`
with `set_config(..., is_local => true)` (= `SET LOCAL`), so Row-Level Security only shows that tenant's rows
and the setting ends with the transaction. The tenant id comes from the signed session (NEX-045), never from
a header.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core.errors import ApiError
from nexus.core.freeze import ensure_not_frozen
from nexus.settings import Settings

log = logging.getLogger("nexus.tenancy")

TENANT_SETTING = "app.tenant_id"


@dataclass(frozen=True)
class ProviderActor:
    """Provider staff acting through an approved access grant (M83, V-3)."""

    grant_id: str
    staff_ref: str


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str
    #: Set when the request runs on a provider grant credential: every audit row then names the grant.
    provider: ProviderActor | None = None


async def bind_tenant(session: AsyncSession, ctx: TenantContext) -> None:
    """Scope the current transaction to one tenant. Must run inside a transaction."""
    if not ctx.tenant_id:
        raise ValueError("tenant id is empty")
    await session.execute(
        text("SELECT set_config(:name, :tenant, true)"),
        {"name": TENANT_SETTING, "tenant": ctx.tenant_id},
    )


async def ensure_region(session: AsyncSession, ctx: TenantContext, settings: Settings) -> None:
    """Data residency (G-5, D45): a cell serves only tenants of its own region.

    A tenant of another region (or one this cell cannot see) is refused with `503 internal` and logged; the
    message never says which region holds the tenant.
    """
    region = (
        await session.execute(text("SELECT region FROM tenants WHERE id = :id"), {"id": ctx.tenant_id})
    ).scalar_one_or_none()
    if region is None:
        # Unknown (or invisible) tenant: a stale or forged session, never a residency question.
        raise ApiError(401, "unauthorized", "Please sign in again.")
    if region != settings.region:
        log.error("tenant %s refused: region %s does not match cell %s", ctx.tenant_id, region, settings.region)
        raise ApiError(503, "internal", "This service is not available for your institution here.")


@asynccontextmanager
async def tenant_transaction(
    sessions: async_sessionmaker[AsyncSession],
    ctx: TenantContext,
    settings: Settings,
    *,
    write: bool = False,
) -> AsyncIterator[AsyncSession]:
    """One transaction scoped to `ctx`, region-checked; commits on success, rolls back on error.

    When `write=True`, refuses a frozen tenant with `423 tenant_frozen` (`core/freeze.py`).
    """
    async with sessions() as session, session.begin():
        await bind_tenant(session, ctx)
        await ensure_region(session, ctx, settings)
        if write:
            await ensure_not_frozen(session, ctx.tenant_id)
        yield session
