"""Who is calling (ARCHITECTURE §6, D44): session cookie → tenant → transaction → user.

`authenticated` is the FastAPI dependency every signed-in endpoint uses. It opens one transaction scoped to
the session's tenant (RLS + region check), verifies the session there, enforces the CSRF token on unsafe
methods, and yields the context; the transaction commits when the endpoint returns. The tenant never comes
from a header.
"""

import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core import db
from nexus.core.errors import ApiError
from nexus.core.sessions import (
    CSRF_COOKIE,
    CSRF_HEADER,
    SESSION_COOKIE,
    parse_cookie,
    resolve_session,
)
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.settings import Settings

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


@dataclass(frozen=True)
class RequestContext:
    tenant: TenantContext
    db: AsyncSession
    user_id: str
    person_id: str
    session_id: str


def app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def check_csrf(request: Request) -> None:
    """Double-submit: unsafe methods must echo the `nexus_csrf` cookie in `X-CSRF-Token`."""
    if request.method in SAFE_METHODS:
        return
    cookie = request.cookies.get(CSRF_COOKIE, "")
    header = request.headers.get(CSRF_HEADER, "")
    if not cookie or not secrets.compare_digest(cookie, header):
        raise ApiError(403, "forbidden", "The request could not be verified. Reload the page and try again.")


async def authenticated(request: Request) -> AsyncIterator[RequestContext]:
    parts = parse_cookie(request.cookies.get(SESSION_COOKIE))
    if parts is None:
        raise ApiError(401, "unauthorized", "Please sign in.")
    check_csrf(request)
    settings = app_settings(request)
    ctx = TenantContext(parts.tenant_id)
    async with tenant_transaction(db.sessionmaker(), ctx, settings) as session:
        active = await resolve_session(session, parts, settings)
        if active is None:
            raise ApiError(401, "unauthorized", "Please sign in again.")
        yield RequestContext(
            tenant=ctx,
            db=session,
            user_id=active.user_id,
            person_id=active.person_id,
            session_id=active.session_id,
        )
