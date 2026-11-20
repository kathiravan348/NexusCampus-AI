"""App factory. Modules mount their routers under `/api/v1` (from NEX-047 on)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from nexus.core.db import dispose_engine, init_engine, ping_database
from nexus.core.errors import ApiErrorEnvelope, install_error_handling
from nexus.core.redis import close_redis, init_redis, ping_redis
from nexus.core.telemetry import setup_telemetry
from nexus.core.timing import boot_elapsed_ms, timing_line, utf8_console
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
        init_redis(cfg)
        elapsed = boot_elapsed_ms()
        if elapsed is not None:
            utf8_console()  # uvicorn's reload child has its own console streams
            print(timing_line("backend:start", "backend:start", elapsed), flush=True)
        yield
        await close_redis()
        await dispose_engine()

    app = FastAPI(
        title="NexusCampus API",
        version="1",
        lifespan=lifespan,
        responses={"default": {"model": ApiErrorEnvelope}},
    )
    install_error_handling(app)
    setup_telemetry(app, cfg)

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
