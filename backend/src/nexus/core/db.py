"""Database access: one async SQLAlchemy 2 engine (psycopg 3) per process.

Tenant tables and Row-Level Security arrive in NEX-043; every query will then run inside a tenant context.
"""

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.settings import Settings

_engine: AsyncEngine | None = None
_sessions: async_sessionmaker[AsyncSession] | None = None


def init_engine(settings: Settings) -> AsyncEngine:
    global _engine, _sessions
    if _engine is None:
        _engine = create_async_engine(
            settings.database_url.get_secret_value(),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=5,
            connect_args={"connect_timeout": 3},
        )
        _sessions = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def dispose_engine() -> None:
    global _engine, _sessions
    if _engine is not None:
        await _engine.dispose()
    _engine, _sessions = None, None


async def ping_database() -> bool:
    """True when `SELECT 1` succeeds; never raises (used by `/readyz`)."""
    if _engine is None:
        return False
    try:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        return False
    return True


async def session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, committed by the caller."""
    if _sessions is None:
        raise RuntimeError("database engine is not initialised")
    async with _sessions() as s:
        yield s
