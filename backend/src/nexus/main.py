"""App factory. Modules mount their routers under `/api/v1`."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx2
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from nexus.core.db import dispose_engine, init_engine, ping_database
from nexus.core.errors import ApiErrorEnvelope, install_error_handling
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.idempotency import install_idempotency
from nexus.core.redis import close_redis, init_redis, ping_redis
from nexus.core.telemetry import setup_telemetry
from nexus.core.timing import boot_elapsed_ms, timing_line, utf8_console
from nexus.core.vault import HttpVault
from nexus.modules.m01 import router as m01
from nexus.modules.m02 import auth, directory, me, scim, sso, writes
from nexus.modules.m02.keycloak_admin import HttpKeycloakAdmin
from nexus.modules.m02.login_state import RedisLoginStateStore
from nexus.modules.m02.oidc import OidcClient
from nexus.modules.m03 import router as m03
from nexus.modules.m04 import router as m04
from nexus.modules.m05 import router as m05
from nexus.modules.m06 import router as m06
from nexus.modules.m07 import router as m07
from nexus.modules.m08 import router as m08
from nexus.modules.m09 import router as m09
from nexus.modules.m10 import router as m10
from nexus.modules.m11 import router as m11
from nexus.modules.m11.gateway import build_gateway
from nexus.modules.m11.retrieval import HashEmbedder
from nexus.modules.m12 import public as m12_public
from nexus.modules.m12 import router as m12
from nexus.modules.m13 import router as m13
from nexus.modules.m14 import router as m14
from nexus.modules.m15 import router as m15
from nexus.modules.m83 import access as m83_access
from nexus.modules.m83 import broker_stub
from nexus.modules.m83 import keys as m83_keys
from nexus.modules.m83.grant_auth import GrantSigner
from nexus.modules.m84 import router as m84
from nexus.settings import Settings, get_settings

log = logging.getLogger("nexus")


class Health(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str


class Readiness(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    database: bool
    redis: bool


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        init_engine(cfg)
        redis = init_redis(cfg)
        http = httpx2.AsyncClient(timeout=10.0)
        # Tests may install their own OIDC client / state store before startup.
        if not hasattr(app.state, "oidc"):
            app.state.oidc = OidcClient(cfg, http)
        if not hasattr(app.state, "vault"):
            app.state.vault = HttpVault(cfg, http)
        app.state.field_cipher = FieldCipher(app.state.vault)
        # AI gateway (NEX-058): tests may install their own fake before startup.
        if not hasattr(app.state, "ai_gateway"):
            app.state.ai_gateway = build_gateway(cfg)
        if not hasattr(app.state, "ai_embedder"):
            app.state.ai_embedder = HashEmbedder()
        if not hasattr(app.state, "keycloak_admin"):
            app.state.keycloak_admin = HttpKeycloakAdmin(cfg, http)
        if not hasattr(app.state, "login_states"):
            app.state.login_states = RedisLoginStateStore(redis)
        elapsed = boot_elapsed_ms()
        if elapsed is not None:
            utf8_console()  # uvicorn's reload child has its own console streams
            print(timing_line("backend:start", "backend:start", elapsed), flush=True)
        yield
        await http.aclose()
        await close_redis()
        await dispose_engine()

    app = FastAPI(
        title="NexusCampus API",
        version="1",
        lifespan=lifespan,
        responses={"default": {"model": ApiErrorEnvelope}},
    )
    app.state.settings = cfg
    app.state.grant_signer = GrantSigner.from_settings(cfg)
    install_error_handling(app)
    install_idempotency(app)
    setup_telemetry(app, cfg)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(m01.router)
    app.include_router(directory.router)
    app.include_router(writes.router)
    app.include_router(sso.router)
    app.include_router(scim.router)
    scim.install_scim_errors(app)
    app.include_router(m03.router)
    app.include_router(m04.router)
    app.include_router(m05.router)
    app.include_router(m06.router)
    app.include_router(m07.router)
    app.include_router(m08.router)
    app.include_router(m10.router)
    app.include_router(m11.router)
    app.include_router(m12.router)
    app.include_router(m09.router)
    app.include_router(m12_public.router)
    app.include_router(m13.router)
    app.include_router(m14.router)
    app.include_router(m15.router)
    app.include_router(m83_keys.router)
    app.include_router(m83_access.router)
    app.include_router(m84.router)
    if cfg.environment != "prod":
        app.include_router(broker_stub.router)

    @app.get("/healthz", response_model=Health, tags=["ops"])
    async def healthz() -> Health:
        """Liveness: the process answers."""
        return Health(status="ok")

    @app.get("/readyz", response_model=Readiness, tags=["ops"], responses={503: {"model": Readiness}})
    async def readyz() -> JSONResponse:
        """Readiness: PostgreSQL and Redis both answer; 503 otherwise."""
        db, cache = await ping_database(), await ping_redis()
        ready = db and cache
        body = Readiness(status="ready" if ready else "not_ready", database=db, redis=cache)
        return JSONResponse(status_code=200 if ready else 503, content=body.model_dump())

    return app
