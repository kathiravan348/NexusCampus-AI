"""Control backend app factory: `uvicorn nexus.control.main:app --port 8100` (dev)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Literal

from fastapi import APIRouter, FastAPI, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.settings import ControlSettings, get_control_settings
from nexus.control.staff import DbStaffStore, StaffSession, StaffStore
from nexus.core.errors import ApiError, install_error_handling

API = "/control/api/v1"
STAFF_HEADER = "X-Nexus-Staff"


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
async def me(request: Request, staff: Annotated[str | None, Header(alias=STAFF_HEADER)] = None) -> StaffSession:
    settings: ControlSettings = request.app.state.settings
    if not settings.dev_staff_header or not staff:
        # Staff SSO with mandatory MFA comes next (P13); until then only the dev header signs in, never in prod.
        raise ApiError(401, "unauthorized", "Sign in to Nexus Control.")
    store: StaffStore = request.app.state.staff
    session = await store.session_of(staff, settings.session_minutes)
    if session is None:
        raise ApiError(401, "unauthorized", "Sign in to Nexus Control.")
    return session


def create_app(settings: ControlSettings | None = None, staff_store: StaffStore | None = None) -> FastAPI:
    cfg = settings or get_control_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.engine = None
        if staff_store is None:
            engine = create_async_engine(cfg.app_url(), pool_pre_ping=True, pool_size=3, max_overflow=2)
            app.state.engine = engine
            app.state.staff = DbStaffStore(engine)
        else:
            app.state.staff = staff_store
        try:
            yield
        finally:
            if app.state.engine is not None:
                await app.state.engine.dispose()

    app = FastAPI(title="Nexus Control API", version="0.1.0", lifespan=lifespan)
    app.state.settings = cfg
    install_error_handling(app)
    app.include_router(router)
    return app


def app() -> FastAPI:
    """Factory for `uvicorn --factory nexus.control.main:app`."""
    return create_app()
