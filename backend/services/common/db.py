"""
Tenant-aware PostgreSQL access (asyncpg).
- One pool per database, connecting as the non-superuser app role (RLS applies).
- `app.tenant_id` is set per database via ALTER DATABASE, so RESET ALL keeps it.
- Table/column names passed to helpers must come from code, never from request input.
"""
import asyncio
import datetime
import decimal
import json
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Optional

import asyncpg

from .config import (APP_DB_PASSWORD, APP_DB_USER, DB_ADMIN_PASSWORD, DB_ADMIN_USER,
                     DB_HOST, DB_PORT)


def _json_default(o: Any):
    if isinstance(o, uuid.UUID):
        return str(o)
    if isinstance(o, (datetime.datetime, datetime.date, datetime.time)):
        return o.isoformat()
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, set):
        return list(o)
    raise TypeError(f"Not JSON serialisable: {type(o)}")


def dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def jsonable(value: Any) -> Any:
    return json.loads(dumps(value))


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec("jsonb", encoder=dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=dumps, decoder=json.loads, schema="pg_catalog")


class PoolRegistry:
    def __init__(self) -> None:
        self._pools: dict[str, asyncpg.Pool] = {}
        self._lock = asyncio.Lock()

    async def get(self, db_name: str) -> asyncpg.Pool:
        pool = self._pools.get(db_name)
        if pool:
            return pool
        async with self._lock:
            if db_name not in self._pools:
                self._pools[db_name] = await asyncpg.create_pool(
                    host=DB_HOST, port=DB_PORT, user=APP_DB_USER, password=APP_DB_PASSWORD,
                    database=db_name, min_size=1, max_size=10, init=_init_connection,
                )
            return self._pools[db_name]

    async def close(self, db_name: str) -> None:
        pool = self._pools.pop(db_name, None)
        if pool:
            await pool.close()

    async def close_all(self) -> None:
        for name in list(self._pools):
            await self.close(name)


pools = PoolRegistry()


@asynccontextmanager
async def transaction(db_name: str) -> AsyncIterator[asyncpg.Connection]:
    pool = await pools.get(db_name)
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


@asynccontextmanager
async def connection(db_name: str) -> AsyncIterator[asyncpg.Connection]:
    pool = await pools.get(db_name)
    async with pool.acquire() as conn:
        yield conn


async def admin_connect(db_name: str = "postgres") -> asyncpg.Connection:
    conn = await asyncpg.connect(host=DB_HOST, port=DB_PORT, user=DB_ADMIN_USER,
                                 password=DB_ADMIN_PASSWORD, database=db_name)
    await _init_connection(conn)
    return conn


# --- query helpers ---------------------------------------------------------------
async def fetch_all(conn, sql: str, *args) -> list[dict]:
    return [dict(r) for r in await conn.fetch(sql, *args)]


async def fetch_one(conn, sql: str, *args) -> Optional[dict]:
    r = await conn.fetchrow(sql, *args)
    return dict(r) if r else None


async def fetch_val(conn, sql: str, *args):
    return await conn.fetchval(sql, *args)


async def insert(conn, table: str, data: dict, returning: str = "*") -> dict:
    cols = list(data.keys())
    placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
    sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) RETURNING {returning}"
    return await fetch_one(conn, sql, *data.values())


async def update(conn, table: str, row_id, data: dict, expected_version: Optional[int] = None) -> Optional[dict]:
    """Update a live (non-deleted) row. Optional optimistic lock via `version`."""
    if not data:
        return await fetch_one(conn, f"SELECT * FROM {table} WHERE id = $1 AND deleted_at IS NULL", row_id)
    keys = list(data.keys())
    sets = ", ".join(f"{k} = ${i + 1}" for i, k in enumerate(keys))
    args = list(data.values()) + [row_id]
    sql = f"UPDATE {table} SET {sets} WHERE id = ${len(args)} AND deleted_at IS NULL"
    if expected_version is not None:
        args.append(expected_version)
        sql += f" AND version = ${len(args)}"
    return await fetch_one(conn, sql + " RETURNING *", *args)


async def get_row(conn, table: str, row_id, *, lock: bool = False) -> Optional[dict]:
    sql = f"SELECT * FROM {table} WHERE id = $1 AND deleted_at IS NULL"
    if lock:
        sql += " FOR UPDATE"
    return await fetch_one(conn, sql, row_id)


async def next_code(conn, key: str, prefix: str, width: int = 5) -> str:
    value = await conn.fetchval(
        """INSERT INTO code_sequences (key, value) VALUES ($1, 1)
           ON CONFLICT (key) DO UPDATE SET value = code_sequences.value + 1
           RETURNING value""", key)
    return f"{prefix}{value:0{width}d}"


def page_args(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, page)
    page_size = max(1, min(page_size, 500))
    return page_size, (page - 1) * page_size
