"""
One-command database setup (idempotent).

Usage (from backend/):
    venv\\Scripts\\python -m scripts.setup_db            # rebuild template, (re)provision demo tenants
    venv\\Scripts\\python -m scripts.setup_db --fresh    # also drop every existing nexus_* database first

Steps:
- Ensure the non-superuser app role exists (RLS is enforced for it).
- Create/upgrade the master registry.
- Rebuild the tenant TEMPLATE database: schema + deterministic demo seed.
- Re-provision every registered tenant from the template (plus the default demo tenants).
"""
import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db.schema import apply_master_schema, apply_tenant_schema  # noqa: E402
from db.seed import seed_template  # noqa: E402
from services.common import db, tenancy  # noqa: E402
from services.common.config import (APP_DB_PASSWORD, APP_DB_USER, MASTER_DB, TEMPLATE_DB,  # noqa: E402
                                    TEMPLATE_TENANT_ID)
from services.common.modules_catalog import PLANS  # noqa: E402

DEFAULT_TENANTS = [
    ("demo", "Nexus Campus Institute of Technology", "admin@nexuscampus.edu", "enterprise"),
    ("greenwood", "Greenwood International College", "principal@greenwood.edu", "standard"),
]


async def _terminate(conn, db_names: list[str]) -> None:
    await conn.execute("""SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                          WHERE datname = ANY($1::text[]) AND pid <> pg_backend_pid()""", db_names)


async def main(fresh: bool) -> None:
    started = time.time()
    root = await db.admin_connect("postgres")
    try:
        if await root.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", APP_DB_USER):
            await root.execute(f"ALTER ROLE {APP_DB_USER} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '{APP_DB_PASSWORD}'")
        else:
            await root.execute(f"CREATE ROLE {APP_DB_USER} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '{APP_DB_PASSWORD}'")
        print(f"[ok] app role '{APP_DB_USER}' ready")

        existing = [r["datname"] for r in await root.fetch("SELECT datname FROM pg_database WHERE datname LIKE 'nexus_%'")]
        if fresh and existing:
            await _terminate(root, existing)
            for name in existing:
                await root.execute(f'DROP DATABASE IF EXISTS "{name}"')
            print(f"[ok] dropped {len(existing)} existing databases: {', '.join(existing)}")
        elif not fresh and MASTER_DB in existing:
            legacy = await _legacy_master(MASTER_DB)
            if legacy:
                raise SystemExit("Legacy master schema detected. Re-run with --fresh to rebuild all databases.")

        if not await root.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", MASTER_DB):
            await root.execute(f'CREATE DATABASE "{MASTER_DB}"')
        await _terminate(root, [TEMPLATE_DB])
        await root.execute(f'DROP DATABASE IF EXISTS "{TEMPLATE_DB}"')
        await root.execute(f'CREATE DATABASE "{TEMPLATE_DB}"')
        await root.execute(f"ALTER DATABASE \"{TEMPLATE_DB}\" SET app.tenant_id = '{TEMPLATE_TENANT_ID}'")
    finally:
        await root.close()

    master = await db.admin_connect(MASTER_DB)
    try:
        await apply_master_schema(master)
        for code, plan in PLANS.items():
            await master.execute(
                """INSERT INTO plans (code, name, modules, max_students) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, modules = EXCLUDED.modules,
                     max_students = EXCLUDED.max_students""",
                code, plan["name"], plan["modules"], plan["max_students"])
        registered = [dict(r) for r in await master.fetch("SELECT slug, name, admin_email, plan FROM tenants")]
    finally:
        await master.close()
    print("[ok] master registry ready")

    template = await db.admin_connect(TEMPLATE_DB)
    try:
        await apply_tenant_schema(template)
        print("[ok] template schema applied (RLS, triggers, grants)")
        summary = await seed_template(template)
        print(f"[ok] template seeded: {summary}")
    finally:
        await template.close()

    tenants = {slug: (name, email, plan) for slug, name, email, plan in DEFAULT_TENANTS}
    for row in registered:
        tenants.setdefault(row["slug"], (row["name"], row["admin_email"], row["plan"]))
    for slug, (name, email, plan) in tenants.items():
        result = await tenancy.provision_tenant(slug=slug, name=name, admin_email=email, plan=plan, actor="setup")
        extra = f" (admin temp password: {result['admin_temporary_password']})" if result.get("admin_temporary_password") else ""
        print(f"[ok] tenant '{slug}' provisioned -> {result['db_name']}{extra}")

    await db.pools.close_all()
    print(f"[done] setup finished in {time.time() - started:.1f}s. Demo password for all seeded accounts: demo123")


async def _legacy_master(name: str) -> bool:
    conn = await db.admin_connect(name)
    try:
        data_type = await conn.fetchval("""SELECT data_type FROM information_schema.columns
                                           WHERE table_name = 'tenants' AND column_name = 'id'""")
        return data_type is not None and data_type != "uuid"
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Set up NexusCampus databases")
    parser.add_argument("--fresh", action="store_true", help="Drop all existing nexus_* databases first")
    asyncio.run(main(parser.parse_args().fresh))
