"""
M28 SaaS Ops Console (PRD M28) — SUPER_ADMIN only.
- Provision (clone template), suspend (revokes all sessions), reinstate, reset (re-clone).
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field

from ..common import db, recipients, tenancy
from ..common.audit import SystemCtx, audit
from ..common.config import MASTER_DB
from ..common.errors import bad_request, conflict, not_found
from ..common.notify import notify
from ..common.rbac import Ctx, require
from ._base import Model

router = APIRouter(prefix="/api/v1/tenants", tags=["M28 SaaS Ops Console"])
guard = require("platform.tenants.manage")


class TenantIn(Model):
    name: str = Field(min_length=3, max_length=120)
    slug: str = Field(pattern=r"^[a-z][a-z0-9_]{2,30}$")
    admin_email: str = Field(min_length=5)
    admin_name: str | None = None
    plan: Literal["standard", "enterprise"] = "standard"


class ReasonIn(Model):
    reason: str = Field(min_length=5)


@router.get("")
async def list_all(ctx: Ctx = Depends(guard)):
    tenants = await tenancy.list_tenants()
    async with db.connection(MASTER_DB) as conn:
        events = await db.fetch_all(conn, "SELECT * FROM tenant_events ORDER BY created_at DESC LIMIT 30")
    return {"tenants": tenants, "events": events, "current": ctx.tenant_slug}


@router.get("/plans")
async def plans(_ctx: Ctx = Depends(guard)):
    async with db.connection(MASTER_DB) as conn:
        return await db.fetch_all(conn, "SELECT * FROM plans ORDER BY code")


@router.post("")
async def provision(payload: TenantIn, ctx: Ctx = Depends(guard)):
    if await tenancy.get_tenant(payload.slug):
        raise conflict("A tenant with this slug already exists. Use reset to re-clone it.")
    result = await tenancy.provision_tenant(slug=payload.slug, name=payload.name, admin_email=payload.admin_email,
                                            admin_name=payload.admin_name, plan=payload.plan, actor=ctx.email)
    async with ctx.tx() as conn:
        await audit(conn, ctx, "tenant.provisioned", "tenant", payload.slug, after={"plan": payload.plan, "db": result["db_name"]})
    return result


async def _tenant_admins_notify(tenant: dict, *, severity: str, title: str, body: str, revoke: bool) -> None:
    async with db.transaction(tenant["db_name"]) as conn:
        if revoke:
            await conn.execute("UPDATE sessions SET revoked_at = now(), revoked_reason = 'tenant_suspended' WHERE revoked_at IS NULL")
        admins = await recipients.with_permission(conn, "platform.settings.manage")
        await notify(conn, SystemCtx(tenant), event_code="tenant.suspended" if revoke else "tenant.reinstated",
                     severity=severity, user_ids=admins, title=title, body=body, category="system")


@router.post("/{slug}/suspend")
async def suspend(slug: str, payload: ReasonIn, ctx: Ctx = Depends(guard)):
    if slug == ctx.tenant_slug:
        raise bad_request("You cannot suspend the tenant you are signed in to")
    tenant = await tenancy.get_tenant(slug)
    if not tenant:
        raise not_found("Tenant")
    if tenant["status"] != "active":
        raise conflict(f"Tenant is {tenant['status']}")
    await tenancy.set_status(slug, "suspended", payload.reason)
    await _tenant_admins_notify(tenant, severity="CRITICAL", title="Institution access suspended", body=payload.reason, revoke=True)
    await tenancy.log_event(slug, "tenant.suspended", ctx.email, {"reason": payload.reason})
    async with ctx.tx() as conn:
        await audit(conn, ctx, "tenant.suspended", "tenant", slug, reason=payload.reason)
    return {"status": "suspended"}


@router.post("/{slug}/reinstate")
async def reinstate(slug: str, ctx: Ctx = Depends(guard)):
    tenant = await tenancy.get_tenant(slug)
    if not tenant:
        raise not_found("Tenant")
    if tenant["status"] != "suspended":
        raise conflict("Only suspended tenants can be reinstated")
    await tenancy.set_status(slug, "active")
    await _tenant_admins_notify({**tenant, "status": "active"}, severity="INFO", title="Institution access reinstated",
                                body="All modules are available again.", revoke=False)
    await tenancy.log_event(slug, "tenant.reinstated", ctx.email)
    async with ctx.tx() as conn:
        await audit(conn, ctx, "tenant.reinstated", "tenant", slug)
    return {"status": "active"}


@router.post("/{slug}/reset")
async def reset(slug: str, ctx: Ctx = Depends(guard)):
    if slug == ctx.tenant_slug:
        raise bad_request("Sign in to a different tenant to reset this one")
    tenant = await tenancy.get_tenant(slug)
    if not tenant:
        raise not_found("Tenant")
    result = await tenancy.provision_tenant(slug=slug, name=tenant["name"], admin_email=tenant["admin_email"],
                                            plan=tenant["plan"], actor=ctx.email)
    await tenancy.log_event(slug, "tenant.reset", ctx.email)
    async with ctx.tx() as conn:
        await audit(conn, ctx, "tenant.reset", "tenant", slug)
    return result
