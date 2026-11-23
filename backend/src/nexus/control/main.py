"""Control backend app factory: `uvicorn nexus.control.main:app --port 8100` (dev)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

import httpx2
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control import (
    accounts,
    analytics,
    auth,
    broker,
    commands,
    commercial,
    delivery_extras,
    fleet,
    licences,
    offboarding,
    provisioning,
    releases,
    support,
    trust,
)
from nexus.control.billing import webhooks
from nexus.control.sessions import DbSessionStore, SessionStore
from nexus.control.settings import ControlSettings, get_control_settings
from nexus.control.staff import DbStaffStore, StaffSession, StaffStore
from nexus.control.viewer import staff_session
from nexus.core.errors import install_error_handling
from nexus.core.vault import HttpVault, Vault
from nexus.modules.m02.login_state import LoginStateStore, RedisLoginStateStore
from nexus.modules.m02.oidc import OidcClient
from nexus.settings import Settings, get_settings

API = "/control/api/v1"


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class Readiness(BaseModel):
    status: Literal["ready", "not_ready"]
    database: bool


router = APIRouter(prefix=API)


@router.get("/health", response_model=Health, tags=["ops"])
async def health() -> Health:
    return Health()


@router.get("/ready", response_model=Readiness, tags=["ops"], responses={503: {"model": Readiness}})
async def ready(request: Request) -> JSONResponse:
    engine = request.app.state.engine
    ok = False
    if engine is not None:
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            ok = True
        except Exception:
            ok = False
    body = Readiness(status="ready" if ok else "not_ready", database=ok)
    return JSONResponse(body.model_dump(), status_code=200 if ok else 503)


@router.get("/me", response_model=StaffSession, response_model_by_alias=True, tags=["staff"])
async def me(session: Annotated[StaffSession, Depends(staff_session)]) -> StaffSession:
    """The signed-in staff member, their roles and permissions (cookie session; dev header outside prod)."""
    return session


def staff_oidc(cfg: ControlSettings, http: httpx2.AsyncClient) -> OidcClient:
    """The product OIDC client pointed at the staff realm, asking for MFA (`acr_values=mfa`)."""
    realm = Settings(
        keycloak_url=cfg.keycloak_url,
        keycloak_realm=cfg.keycloak_realm,
        oidc_client_id=cfg.oidc_client_id,
        oidc_client_secret=cfg.oidc_client_secret,
        api_public_url=cfg.api_public_url,
        app_public_url=cfg.app_public_url,
    )
    return OidcClient(
        realm,
        http,
        callback_path=auth.CALLBACK_PATH,
        post_logout_url=cfg.app_public_url.rstrip("/") + "/",
        scopes=auth.STAFF_SCOPES,
        extra_auth_params={"acr_values": auth.REQUIRED_ACR},
    )


def create_app(
    settings: ControlSettings | None = None,
    staff_store: StaffStore | None = None,
    session_store: SessionStore | None = None,
    http: httpx2.AsyncClient | None = None,
    login_states: LoginStateStore | None = None,
    vault: Vault | None = None,
) -> FastAPI:
    """Tests pass in-memory stores and a fake Keycloak transport; otherwise the control DB, Valkey and Keycloak."""
    cfg = settings or get_control_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.engine = None
        redis: Redis | None = None
        if staff_store is None or session_store is None:
            engine = create_async_engine(cfg.app_url(), pool_pre_ping=True, pool_size=3, max_overflow=2)
            app.state.engine = engine
        app.state.staff = staff_store or DbStaffStore(app.state.engine)
        app.state.sessions = session_store or DbSessionStore(app.state.engine)
        client = http or httpx2.AsyncClient(timeout=10)
        app.state.oidc = staff_oidc(cfg, client)
        app.state.vault = vault or HttpVault(get_settings(), client)
        if login_states is None:
            redis = Redis.from_url(get_settings().redis_url.get_secret_value(), socket_connect_timeout=3)
            app.state.login_states = RedisLoginStateStore(redis)
        else:
            app.state.login_states = login_states
        try:
            yield
        finally:
            if http is None:
                await client.aclose()
            if redis is not None:
                await redis.aclose()
            if app.state.engine is not None:
                await app.state.engine.dispose()

    app = FastAPI(title="Nexus Control API", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg
    app.state.agent_update_checked_at = {}
    app.state.agent_commands_checked_at = {}
    install_error_handling(app)
    app.include_router(router)
    app.include_router(auth.router)
    app.include_router(accounts.router)
    app.include_router(commercial.router)
    app.include_router(webhooks.router)
    app.include_router(licences.router)
    app.include_router(fleet.router)
    app.include_router(releases.router)
    app.include_router(commands.router)
    app.include_router(support.router)
    app.include_router(delivery_extras.router)
    app.include_router(analytics.router)
    app.include_router(trust.router)
    app.include_router(provisioning.router)
    app.include_router(offboarding.router)
    app.include_router(broker.router)
    return app


def app() -> FastAPI:
    """Factory for `uvicorn --factory nexus.control.main:app`."""
    return create_app()
