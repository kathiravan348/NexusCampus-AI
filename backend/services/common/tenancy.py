"""
Tenant registry & provisioning (M01 / M28).
- Master DB holds the tenant registry; each tenant has its own database cloned from a template
  that the application never serves (so the template stays pristine).
- Provisioning: clone -> stamp tenant_id on every row -> clear per-tenant runtime tables -> activate.
"""
import re
import time
import uuid
from typing import Optional

from . import db
from .config import DEMO_TENANT_SLUG, MASTER_DB, TEMPLATE_DB
from .modules_catalog import PLANS
from .security import hash_password, temporary_password

SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{2,30}$")
RUNTIME_TABLES = ["notification_deliveries", "notifications", "audit_log", "job_runs", "sessions", "webhook_deliveries"]
_cache: dict[str, tuple[float, Optional[dict]]] = {}


def db_name_for(slug: str) -> str:
    return f"nexus_tenant_{slug}"


def invalidate(slug: str) -> None:
    _cache.pop(slug, None)


async def get_tenant(slug: str) -> Optional[dict]:
    if not slug:
        return None
    hit = _cache.get(slug)
    if hit and time.time() - hit[0] < 10:
        return hit[1]
    async with db.connection(MASTER_DB) as conn:
        tenant = await db.fetch_one(conn, """SELECT id, slug, name, db_name, admin_email, status, plan, suspended_reason,
                                                    created_at, updated_at FROM tenants WHERE slug = $1""", slug)
    _cache[slug] = (time.time(), tenant)
    return tenant


async def list_tenants(active_only: bool = False) -> list[dict]:
    async with db.connection(MASTER_DB) as conn:
        sql = """SELECT id, slug, name, db_name, admin_email, status, plan, suspended_reason, created_at, updated_at
                 FROM tenants"""
        if active_only:
            sql += " WHERE status = 'active'"
        return await db.fetch_all(conn, sql + " ORDER BY created_at")


async def log_event(slug: str, event_code: str, actor: str, detail: Optional[dict] = None) -> None:
    async with db.connection(MASTER_DB) as conn:
        await conn.execute("INSERT INTO tenant_events (tenant_slug, event_code, actor, detail) VALUES ($1, $2, $3, $4)",
                           slug, event_code, actor, detail or {})


async def set_status(slug: str, status: str, reason: Optional[str] = None) -> dict:
    async with db.connection(MASTER_DB) as conn:
        row = await db.fetch_one(conn, """UPDATE tenants SET status = $1, suspended_reason = $2, updated_at = now()
                                          WHERE slug = $3 RETURNING *""", status, reason, slug)
    invalidate(slug)
    return row


async def provision_tenant(*, slug: str, name: str, admin_email: str, plan: str = "enterprise",
                           admin_name: Optional[str] = None, actor: str = "system") -> dict:
    if not SLUG_RE.match(slug):
        raise ValueError("Slug must start with a letter and use 3-31 lowercase letters, digits or underscores")
    target = db_name_for(slug)
    await db.pools.close(target)

    admin = await db.admin_connect(MASTER_DB)
    try:
        existing = await admin.fetchrow("SELECT id FROM tenants WHERE slug = $1", slug)
        tenant_id = existing["id"] if existing else uuid.uuid4()
        await admin.execute(
            """INSERT INTO tenants (id, slug, name, db_name, admin_email, status, plan)
               VALUES ($1, $2, $3, $4, $5, 'provisioning', $6)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, admin_email = EXCLUDED.admin_email,
                 status = 'provisioning', plan = EXCLUDED.plan, suspended_reason = NULL, updated_at = now()""",
            tenant_id, slug, name, target, admin_email, plan)
        invalidate(slug)
        await admin.execute("""SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                               WHERE datname = ANY($1::text[]) AND pid <> pg_backend_pid()""", [TEMPLATE_DB, target])
        await admin.execute(f'DROP DATABASE IF EXISTS "{target}"')
        await admin.execute(f'CREATE DATABASE "{target}" TEMPLATE "{TEMPLATE_DB}"')
        await admin.execute(f"ALTER DATABASE \"{target}\" SET app.tenant_id = '{tenant_id}'")
    finally:
        await admin.close()

    temp_password = None
    tenant_conn = await db.admin_connect(target)
    try:
        async with tenant_conn.transaction():
            await tenant_conn.execute("SET LOCAL session_replication_role = replica")
            tables = await tenant_conn.fetch(
                """SELECT DISTINCT table_name FROM information_schema.columns
                   WHERE table_schema = 'public' AND column_name = 'tenant_id'""")
            for t in tables:
                await tenant_conn.execute(f'UPDATE "{t["table_name"]}" SET tenant_id = $1', tenant_id)
            await tenant_conn.execute(f"TRUNCATE {', '.join(RUNTIME_TABLES)}")
            await tenant_conn.execute("UPDATE institution SET name = $1", name)
            plan_modules = PLANS.get(plan, PLANS["enterprise"])["modules"]
            await tenant_conn.execute(
                """UPDATE feature_flags SET in_plan = module_code = ANY($1::text[]),
                                            enabled = module_code = ANY($1::text[])""", plan_modules)
            if slug != DEMO_TENANT_SLUG:
                await tenant_conn.execute("""UPDATE users SET status = 'inactive', is_demo_persona = false
                                             WHERE role_key = 'super_admin'""")
                existing_admin = await tenant_conn.fetchval("SELECT id FROM users WHERE lower(email) = lower($1)",
                                                            admin_email)
                temp_password = temporary_password()
                if existing_admin:
                    await tenant_conn.execute("""UPDATE users SET role_key = 'admin', status = 'active', password_hash = $2
                                                 WHERE id = $1""", existing_admin, hash_password(temp_password))
                else:
                    await tenant_conn.execute(
                        """INSERT INTO users (tenant_id, email, name, password_hash, role_key, status, source)
                           VALUES ($1, lower($2), $3, $4, 'admin', 'active', 'system')""",
                        tenant_id, admin_email, admin_name or "Institution Administrator", hash_password(temp_password))
    finally:
        await tenant_conn.close()

    row = await set_status(slug, "active")
    await log_event(slug, "tenant.provisioned", actor, {"plan": plan})
    return {**row, "admin_temporary_password": temp_password}
