import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import asyncpg
from typing import Dict, Any, List, Optional
from .config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, MASTER_DB, DEFAULT_DEMO_DB

class DatabaseManager:
    def __init__(self):
        self._async_pools: Dict[str, asyncpg.Pool] = {}

    def get_sync_connection(self, db_name: str = MASTER_DB):
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=db_name
        )
        return conn

    async def get_async_pool(self, db_name: str) -> asyncpg.Pool:
        if db_name not in self._async_pools:
            pool = await asyncpg.create_pool(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=db_name,
                min_size=1,
                max_size=10
            )
            self._async_pools[db_name] = pool
        return self._async_pools[db_name]

    def resolve_tenant_db(self, tenant_id: Optional[str] = None) -> str:
        if not tenant_id or tenant_id.lower() in ("default", "demo", DEFAULT_DEMO_DB.lower(), "nexus_default_demo"):
            return DEFAULT_DEMO_DB
        clean_slug = "".join(c for c in tenant_id.lower() if c.isalnum() or c == "_")
        if clean_slug.startswith("nexus_tenant_"):
            return clean_slug
        return f"nexus_tenant_{clean_slug}"

    async def close_all_pools(self):
        for pool in self._async_pools.values():
            await pool.close()
        self._async_pools.clear()

    def clone_template_db(self, slug: str, institution_name: str, admin_email: str) -> str:
        """
        Instantaneous native PostgreSQL clone from template database (nexus_default_demo).
        The default demo DB is strictly used as a template and is never modified.
        """
        clean_slug = "".join(c for c in slug.lower() if c.isalnum() or c == "_")
        new_db_name = f"nexus_tenant_{clean_slug}"

        # 1. Connect to MASTER_DB with AUTOCOMMIT to execute CREATE DATABASE
        conn = self.get_sync_connection(MASTER_DB)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        try:
            # Terminate any lingering read connections to the template DB
            cur.execute(f"""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = '{DEFAULT_DEMO_DB}' AND pid <> pg_backend_pid();
            """)

            # Drop existing if re-onboarding/resetting
            cur.execute(f'DROP DATABASE IF EXISTS "{new_db_name}";')

            # Instantaneous template clone
            cur.execute(f'CREATE DATABASE "{new_db_name}" WITH TEMPLATE "{DEFAULT_DEMO_DB}";')

            # Register tenant in master registry
            cur.execute("""
                INSERT INTO tenants (name, slug, db_name, admin_email, status, plan)
                VALUES (%s, %s, %s, %s, 'active', 'enterprise_demo')
                ON CONFLICT (slug) DO UPDATE 
                SET name = EXCLUDED.name, 
                    admin_email = EXCLUDED.admin_email, 
                    status = 'active',
                    updated_at = NOW();
            """, (institution_name, clean_slug, new_db_name, admin_email))

        finally:
            cur.close()
            conn.close()

        # 2. Connect to the cloned database to customize tenant branding
        # Notice: The default demo DB (nexus_default_demo) remains completely unaltered!
        tenant_conn = self.get_sync_connection(new_db_name)
        tenant_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        t_cur = tenant_conn.cursor()
        try:
            t_cur.execute("""
                UPDATE institution_settings 
                SET institution_name = %s, admin_email = %s, updated_at = NOW() 
                WHERE id = 1;
            """, (institution_name, admin_email))
        finally:
            t_cur.close()
            tenant_conn.close()

        return new_db_name

    def list_all_tenants(self) -> List[Dict[str, Any]]:
        conn = self.get_sync_connection(MASTER_DB)
        cur = conn.cursor()
        try:
            cur.execute("SELECT id, name, slug, db_name, admin_email, status, plan, created_at::text FROM tenants ORDER BY id ASC;")
            rows = cur.fetchall()
            tenants = []
            for r in rows:
                tenants.append({
                    "id": r[0],
                    "name": r[1],
                    "slug": r[2],
                    "db_name": r[3],
                    "admin_email": r[4],
                    "status": r[5],
                    "plan": r[6],
                    "created_at": r[7]
                })
            return tenants
        finally:
            cur.close()
            conn.close()

db_manager = DatabaseManager()
