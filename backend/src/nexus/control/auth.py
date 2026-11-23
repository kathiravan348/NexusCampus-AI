"""Staff sign-in (NEX-097, P13): `/control/api/v1/auth/login` → realm `nexus-staff` → `/auth/callback` → Control.

MFA is mandatory: the login asks for `acr_values=mfa` and the callback refuses any ID token whose `acr` is not `mfa`
(the realm maps password + one-time code to that level). The staff member is matched by verified work email and must
be active and MFA-enrolled. The session token lives only in an HttpOnly cookie; the database keeps its hash.
"""

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse

from nexus.control.sessions import SESSION_COOKIE, SessionStore
from nexus.control.settings import ControlSettings
from nexus.control.staff import StaffStore
from nexus.core.errors import ApiError
from nexus.modules.m02.login_state import LoginStateStore
from nexus.modules.m02.oidc import OidcClient, pkce_pair

API = "/control/api/v1"
CALLBACK_PATH = f"{API}/auth/callback"
REQUIRED_ACR = "mfa"
STAFF_SCOPES = "openid email profile"

router = APIRouter(prefix=f"{API}/auth", tags=["staff sign-in"])


def safe_return_to(value: str | None) -> str:
    """Only same-app paths (`/…`), never `//host` or schemes: no open redirect."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value[:512]


def _refuse() -> ApiError:
    return ApiError(401, "unauthorized", "Sign-in was not completed.")


@router.get("/login", status_code=302)
async def login(request: Request, return_to: Annotated[str | None, Query(alias="returnTo")] = None) -> RedirectResponse:
    oidc: OidcClient = request.app.state.oidc
    states: LoginStateStore = request.app.state.login_states
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier, challenge = pkce_pair()
    await states.put("control:" + state, {"verifier": verifier, "nonce": nonce, "returnTo": safe_return_to(return_to)})
    return RedirectResponse(await oidc.authorize_url(state=state, nonce=nonce, code_challenge=challenge), 302)


def _staff_email(claims: dict[str, Any]) -> str:
    if claims.get("acr") != REQUIRED_ACR:  # password alone is never enough for staff (P13)
        raise _refuse()
    email = claims.get("email")
    if not isinstance(email, str) or claims.get("email_verified") is not True:
        raise _refuse()
    return email


@router.get("/callback", status_code=302)
async def callback(
    request: Request,
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    settings: ControlSettings = request.app.state.settings
    oidc: OidcClient = request.app.state.oidc
    states: LoginStateStore = request.app.state.login_states
    staff: StaffStore = request.app.state.staff
    sessions: SessionStore = request.app.state.sessions
    if not code or not state:
        raise _refuse()
    saved = await states.pop("control:" + state)
    if saved is None:
        raise _refuse()
    tokens = await oidc.exchange_code(code=code, code_verifier=str(saved["verifier"]))
    id_token = tokens.get("id_token")
    if not isinstance(id_token, str):
        raise _refuse()
    claims = await oidc.verify_id_token(id_token, nonce=str(saved["nonce"]))
    staff_id = await staff.id_by_email(_staff_email(claims))
    if staff_id is None or await staff.session_of(staff_id, settings.session_minutes) is None:
        raise _refuse()  # unknown, inactive or not MFA-enrolled
    await staff.record_sign_in(staff_id)
    token = await sessions.create(staff_id, settings.session_minutes)
    target = settings.app_public_url.rstrip("/") + str(saved["returnTo"])
    response = RedirectResponse(target, status_code=302)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_minutes * 60,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        path="/control",
    )
    return response


@router.post("/logout")
async def logout(request: Request) -> JSONResponse:
    """Revokes the session; the app then sends the browser to `redirect` (Keycloak sign-out)."""
    oidc: OidcClient = request.app.state.oidc
    sessions: SessionStore = request.app.state.sessions
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await sessions.revoke(token)
    response = JSONResponse({"redirect": await oidc.end_session_url()})
    response.delete_cookie(SESSION_COOKIE, path="/control")
    return response
