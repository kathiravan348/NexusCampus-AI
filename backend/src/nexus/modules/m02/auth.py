"""Sign-in through Keycloak (D44): `/api/v1/auth/login` → Keycloak → `/api/v1/auth/callback` → app.

The Keycloak *organization* (alias = tenant id) names the tenant; the user is matched inside that tenant by
the pinned Keycloak subject, or on first sign-in by verified email (then pinned). Only `active` users sign in.
Every sign-in and sign-out is audited.
"""

import secrets
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core import db
from nexus.core.audit import AuditInput, record_audit
from nexus.core.errors import ApiError
from nexus.core.ids import new_id
from nexus.core.request_context import RequestContext, app_settings, authenticated
from nexus.core.sessions import (
    CSRF_COOKIE,
    DEVICE_COOKIE,
    SESSION_COOKIE,
    create_session,
    device_label,
    revoke_session,
)
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.modules.m02.login_state import LoginStateStore
from nexus.modules.m02.oidc import OidcClient, pkce_pair
from nexus.settings import Settings

router = APIRouter(prefix="/api/v1/auth", tags=["m02 sign-in"])
DEVICE_MAX_AGE = 400 * 24 * 3600


def oidc_client(request: Request) -> OidcClient:
    client: OidcClient = request.app.state.oidc
    return client


def login_states(request: Request) -> LoginStateStore:
    store: LoginStateStore = request.app.state.login_states
    return store


def safe_return_to(value: str | None) -> str:
    """Only same-app paths (`/…`), never `//host` or schemes: no open redirect."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value[:512]


@router.get("/login", status_code=302)
async def login(
    request: Request,
    oidc: Annotated[OidcClient, Depends(oidc_client)],
    states: Annotated[LoginStateStore, Depends(login_states)],
    return_to: Annotated[str | None, Query(alias="returnTo")] = None,
) -> RedirectResponse:
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier, challenge = pkce_pair()
    await states.put(state, {"verifier": verifier, "nonce": nonce, "returnTo": safe_return_to(return_to)})
    url = await oidc.authorize_url(state=state, nonce=nonce, code_challenge=challenge)
    response = RedirectResponse(url, status_code=302)
    if not request.cookies.get(DEVICE_COOKIE):
        response.set_cookie(
            DEVICE_COOKIE, new_id("dev"), max_age=DEVICE_MAX_AGE, httponly=True, secure=True, samesite="lax"
        )
    return response


def _tenant_of(claims: dict[str, Any]) -> str:
    org = claims.get("organization")
    aliases = list(org) if isinstance(org, dict | list) else []
    if len(aliases) != 1 or not isinstance(aliases[0], str):
        raise ApiError(403, "forbidden", "Your account is not linked to one institution.")
    return aliases[0]


async def _find_user(session: AsyncSession, claims: dict[str, Any]) -> tuple[str, str]:
    sub = str(claims["sub"])
    row = (
        await session.execute(text("SELECT id, status FROM users WHERE idp_subject = :sub"), {"sub": sub})
    ).one_or_none()
    if row is None and claims.get("email_verified") is True and claims.get("email"):
        row = (
            await session.execute(
                text("SELECT id, status FROM users WHERE lower(email) = lower(:e) AND idp_subject IS NULL"),
                {"e": str(claims["email"])},
            )
        ).one_or_none()
        if row is not None:
            await session.execute(
                text("UPDATE users SET idp_subject = :sub WHERE id = :id"), {"sub": sub, "id": row.id}
            )
    if row is None:
        raise ApiError(403, "forbidden", "No NexusCampus account matches this sign-in.")
    if row.status != "active":
        raise ApiError(403, "forbidden", "This account cannot sign in. Ask your administrator.")
    return str(row.id), str(row.status)


def _auth_method(claims: dict[str, Any]) -> tuple[str, bool]:
    amr = claims.get("amr") or []
    methods = {str(m) for m in amr} if isinstance(amr, list) else set()
    method = "sso" if claims.get("identity_provider") or claims.get("idp") else "password"
    if "hwk" in methods or "swk" in methods:
        method = "passkey"
    return method, bool(methods & {"otp", "mfa", "hwk", "swk"})


@router.get("/callback", status_code=302)
async def callback(
    request: Request,
    oidc: Annotated[OidcClient, Depends(oidc_client)],
    states: Annotated[LoginStateStore, Depends(login_states)],
    settings: Annotated[Settings, Depends(app_settings)],
    code: Annotated[str, Query(min_length=1, max_length=4096)],
    state: Annotated[str, Query(min_length=1, max_length=256)],
) -> RedirectResponse:
    saved = await states.pop(state)
    if saved is None:
        raise ApiError(400, "invalid_request", "This sign-in link has expired. Please sign in again.")
    tokens = await oidc.exchange_code(code=code, code_verifier=saved["verifier"])
    claims = await oidc.verify_id_token(str(tokens.get("id_token", "")), nonce=saved["nonce"])
    ctx = TenantContext(_tenant_of(claims))
    method, mfa = _auth_method(claims)
    device_id = request.cookies.get(DEVICE_COOKIE) or new_id("dev")
    async with tenant_transaction(db.sessionmaker(), ctx, settings) as session:
        user_id, _ = await _find_user(session, claims)
        await session.execute(
            text("UPDATE users SET last_sign_in_at = :now WHERE id = :id"),
            {"now": datetime.now(UTC), "id": user_id},
        )
        created = await create_session(
            session,
            ctx,
            settings,
            user_id=user_id,
            device_id=device_id[:128],
            device_label=device_label(request.headers.get("user-agent")),
            auth_method=method,
            mfa_verified=mfa,
            ip_address=request.client.host if request.client else None,
        )
        await record_audit(
            session,
            ctx,
            AuditInput(
                action="m02.user.signedIn",
                actor_kind="user",
                actor_id=user_id,
                target_type="user",
                target_id=user_id,
                device_id=device_id[:128],
            ),
        )
    response = RedirectResponse(settings.app_public_url.rstrip("/") + saved["returnTo"], status_code=302)
    max_age = int((created.expires_at - datetime.now(UTC)).total_seconds())
    response.set_cookie(
        SESSION_COOKIE,
        created.cookie_value,
        max_age=max_age,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE,
        secrets.token_urlsafe(32),
        max_age=max_age,
        httponly=False,
        secure=True,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        DEVICE_COOKIE, device_id[:128], max_age=DEVICE_MAX_AGE, httponly=True, secure=True, samesite="lax"
    )
    return response


class LogoutOut(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    #: Keycloak's end-session page (ends the single sign-on session too); null if the realm has none.
    logout_url: str | None = Field(alias="logoutUrl")


@router.post("/logout", response_model=LogoutOut, response_model_by_alias=True)
async def logout(
    response: Response,
    ctx: Annotated[RequestContext, Depends(authenticated)],
    oidc: Annotated[OidcClient, Depends(oidc_client)],
) -> LogoutOut:
    await revoke_session(ctx.db, ctx.session_id)
    await record_audit(
        ctx.db,
        ctx.tenant,
        AuditInput(
            action="m02.user.signedOut",
            actor_kind="user",
            actor_id=ctx.user_id,
            target_type="user",
            target_id=ctx.user_id,
        ),
    )
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    response.delete_cookie(CSRF_COOKIE, path="/", secure=True, samesite="lax")
    try:
        url = await oidc.end_session_url()
    except ApiError:
        url = None
    return LogoutOut(logout_url=url)
