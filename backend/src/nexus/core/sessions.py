"""Server sessions (D44). The browser holds `nexus_session = <tenantId>.<sessionId>.<token>` (HttpOnly,
Secure, SameSite=Lax); the database holds only `sha256(token)`. The tenant part is trusted only after the
token hash matched **inside that tenant's RLS context**, so a forged tenant id never reaches another tenant.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext
from nexus.settings import Settings

SESSION_COOKIE = "nexus_session"
CSRF_COOKIE = "nexus_csrf"
DEVICE_COOKIE = "nexus_device"
CSRF_HEADER = "X-CSRF-Token"
#: Refresh `last_seen_at` at most once a minute (fewer writes; idle limit stays exact to a minute).
TOUCH_EVERY = timedelta(minutes=1)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CookieParts:
    tenant_id: str
    session_id: str
    token: str


def parse_cookie(value: str | None) -> CookieParts | None:
    if not value:
        return None
    parts = value.split(".")
    if len(parts) != 3 or not all(parts) or any(len(p) > 128 for p in parts):
        return None
    return CookieParts(*parts)


@dataclass(frozen=True)
class NewSession:
    session_id: str
    cookie_value: str
    expires_at: datetime


@dataclass(frozen=True)
class ActiveSession:
    session_id: str
    user_id: str
    person_id: str


async def create_session(
    db: AsyncSession,
    ctx: TenantContext,
    settings: Settings,
    *,
    user_id: str,
    device_id: str,
    device_label: str,
    auth_method: str,
    mfa_verified: bool,
    ip_address: str | None,
) -> NewSession:
    now = datetime.now(UTC)
    session_id = new_id("ses")
    token = secrets.token_urlsafe(32)
    expires = now + timedelta(hours=settings.session_absolute_hours)
    await db.execute(
        text(
            "INSERT INTO sessions (id, tenant_id, user_id, device_id, device_label, auth_method, "
            "mfa_verified, ip_address, created_at, last_seen_at, expires_at, token_hash) "
            "VALUES (:id, :t, :u, :d, :label, :method, :mfa, :ip, :now, :now, :exp, :hash)"
        ),
        {
            "id": session_id,
            "t": ctx.tenant_id,
            "u": user_id,
            "d": device_id,
            "label": device_label[:200],
            "method": auth_method,
            "mfa": mfa_verified,
            "ip": ip_address,
            "now": now,
            "exp": expires,
            "hash": token_hash(token),
        },
    )
    return NewSession(session_id, f"{ctx.tenant_id}.{session_id}.{token}", expires)


async def resolve_session(db: AsyncSession, parts: CookieParts, settings: Settings) -> ActiveSession | None:
    """The live session for the cookie (token matches; not revoked, expired or idle), touched; else None.

    Must run in the tenant context of `parts.tenant_id`; RLS makes any other tenant's rows invisible.
    """
    now = datetime.now(UTC)
    row = (
        await db.execute(
            text(
                "SELECT s.id, s.user_id, u.person_id, s.last_seen_at, s.token_hash FROM sessions s "
                "JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id "
                "WHERE s.id = :id AND s.revoked_at IS NULL AND s.expires_at > :now "
                "AND s.last_seen_at > :idle AND u.status = 'active'"
            ),
            {
                "id": parts.session_id,
                "now": now,
                "idle": now - timedelta(minutes=settings.session_idle_minutes),
            },
        )
    ).one_or_none()
    if row is None or row.token_hash is None:
        return None
    if not secrets.compare_digest(row.token_hash, token_hash(parts.token)):
        return None
    if now - row.last_seen_at >= TOUCH_EVERY:
        await db.execute(text("UPDATE sessions SET last_seen_at = :now WHERE id = :id"), {"now": now, "id": row.id})
    return ActiveSession(session_id=row.id, user_id=row.user_id, person_id=row.person_id)


async def revoke_session(db: AsyncSession, session_id: str) -> None:
    await db.execute(
        text("UPDATE sessions SET revoked_at = :now WHERE id = :id AND revoked_at IS NULL"),
        {"now": datetime.now(UTC), "id": session_id},
    )


def device_label(user_agent: str | None) -> str:
    """`"Chrome · Windows"` from a User-Agent; no version numbers (less fingerprinting)."""
    ua = user_agent or ""
    browser = next(
        (
            name
            for key, name in (
                ("Edg/", "Edge"),
                ("OPR/", "Opera"),
                ("Firefox/", "Firefox"),
                ("Chrome/", "Chrome"),
                ("Safari/", "Safari"),
            )
            if key in ua
        ),
        "Browser",
    )
    system = next(
        (
            name
            for key, name in (
                ("Windows", "Windows"),
                ("Android", "Android"),
                ("iPhone", "iPhone"),
                ("iPad", "iPad"),
                ("Mac OS X", "macOS"),
                ("Linux", "Linux"),
            )
            if key in ua
        ),
        "Unknown device",
    )
    return f"{browser} · {system}"
