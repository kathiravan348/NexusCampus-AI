"""Who is asking (NEX-101): the signed-in staff member, their permissions and — for partner users — the accounts
they may see (P12). Every Control route depends on `require(permission)`; there is no route without a check."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request

from nexus.control.sessions import SESSION_COOKIE, SessionStore
from nexus.control.settings import ControlSettings
from nexus.control.staff import StaffSession, StaffStore, utc_text
from nexus.core.errors import ApiError

STAFF_HEADER = "X-Nexus-Staff"


def _unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", "Sign in to Nexus Control.")


async def staff_session(
    request: Request, staff: Annotated[str | None, Header(alias=STAFF_HEADER)] = None
) -> StaffSession:
    """The cookie session (staff SSO + MFA); in dev and test only, the `X-Nexus-Staff` header instead."""
    settings: ControlSettings = request.app.state.settings
    store: StaffStore = request.app.state.staff
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sessions: SessionStore = request.app.state.sessions
        opened = await sessions.resolve(token)
        found = await store.session_of(opened.staff_id, settings.session_minutes) if opened else None
        if opened is None or found is None:
            raise _unauthorized()
        return found.model_copy(update={"expires_at": utc_text(opened.expires_at)})
    if not settings.dev_staff_header or not staff:
        raise _unauthorized()
    session = await store.session_of(staff, settings.session_minutes)
    if session is None:
        raise _unauthorized()
    return session


@dataclass(frozen=True)
class Viewer:
    session: StaffSession
    #: Accounts a partner user may see; None = not limited (our own staff).
    account_ids: frozenset[str] | None

    @property
    def staff_id(self) -> str:
        return self.session.staff.id

    def can(self, permission: str) -> bool:
        return permission in self.session.permissions


async def current_viewer(request: Request, session: Annotated[StaffSession, Depends(staff_session)]) -> Viewer:
    partner = session.staff.partner_id
    if partner is None:
        return Viewer(session, None)
    store: StaffStore = request.app.state.staff
    return Viewer(session, frozenset(await store.accounts_of_partner(partner)))


def require(permission: str) -> Callable[..., Awaitable[Viewer]]:
    """Dependency: the viewer, or 403 when their roles do not include `permission` (deny by default, V-1)."""

    async def guard(viewer: Annotated[Viewer, Depends(current_viewer)]) -> Viewer:
        if not viewer.can(permission):
            raise ApiError(403, "forbidden", "Your roles do not include this.")
        return viewer

    return guard
