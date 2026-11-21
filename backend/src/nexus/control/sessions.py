"""Staff sessions (NEX-097): a random token in an HttpOnly cookie; only its SHA-256 is stored (control DB)."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy import Column, DateTime, ForeignKey, String, Table, select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from nexus.control.staff import metadata

SESSION_COOKIE = "nexus_control_session"

staff_sessions = Table(
    "staff_sessions",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("staff_id", String(64), ForeignKey("staff_users.id"), nullable=False, index=True),
    Column("token_hash", String(64), nullable=False, unique=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True), nullable=True),
)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class OpenSession:
    staff_id: str
    expires_at: datetime


class SessionStore(Protocol):
    async def create(self, staff_id: str, minutes: int) -> str: ...
    async def resolve(self, token: str) -> OpenSession | None: ...
    async def revoke(self, token: str) -> None: ...


def _new() -> tuple[str, str, datetime]:
    return secrets.token_urlsafe(32), "ses_" + secrets.token_hex(12), datetime.now(UTC)


class DbSessionStore:
    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def create(self, staff_id: str, minutes: int) -> str:
        token, sid, now = _new()
        async with self._engine.begin() as conn:
            await conn.execute(
                staff_sessions.insert().values(
                    id=sid,
                    staff_id=staff_id,
                    token_hash=token_hash(token),
                    created_at=now,
                    expires_at=now + timedelta(minutes=minutes),
                )
            )
        return token

    async def resolve(self, token: str) -> OpenSession | None:
        now = datetime.now(UTC)
        async with self._engine.connect() as conn:
            row = (
                await conn.execute(
                    select(staff_sessions.c.staff_id, staff_sessions.c.expires_at).where(
                        staff_sessions.c.token_hash == token_hash(token),
                        staff_sessions.c.revoked_at.is_(None),
                        staff_sessions.c.expires_at > now,
                    )
                )
            ).first()
        return OpenSession(row[0], row[1]) if row else None

    async def revoke(self, token: str) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                update(staff_sessions)
                .where(staff_sessions.c.token_hash == token_hash(token), staff_sessions.c.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )


class MemorySessionStore:
    """Tests only."""

    def __init__(self) -> None:
        self.rows: dict[str, tuple[str, datetime, bool]] = {}

    async def create(self, staff_id: str, minutes: int) -> str:
        token, _, now = _new()
        self.rows[token_hash(token)] = (staff_id, now + timedelta(minutes=minutes), False)
        return token

    async def resolve(self, token: str) -> OpenSession | None:
        row = self.rows.get(token_hash(token))
        if row is None or row[2] or row[1] <= datetime.now(UTC):
            return None
        return OpenSession(row[0], row[1])

    async def revoke(self, token: str) -> None:
        h = token_hash(token)
        if h in self.rows:
            staff_id, exp, _ = self.rows[h]
            self.rows[h] = (staff_id, exp, True)
