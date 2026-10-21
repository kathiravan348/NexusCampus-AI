"""
NexusCampus API — modular monolith entrypoint.
- Mounts every module router; request-id + timing middleware; central error handling.
- Starts the background job scheduler (disable with SCHEDULER_ENABLED=false).
Run from backend/:  venv\\Scripts\\uvicorn services.gateway.main:app --reload --port 8000
"""
import asyncio
import importlib
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from ..common import db, tenancy
from ..common.config import AI_ENABLED, CORS_ORIGINS, DEMO_MODE, MASTER_DB, SCHEDULER_ENABLED, TEMPLATE_DB
from ..common.errors import configure_logging, register_error_handlers
from ..common.jobs import JOBS, scheduler_loop

logger = logging.getLogger("nexus")

MODULES = ["identity", "platform", "tenants", "approvals", "sis", "admissions", "academics", "attendance",
           "gradebook", "fees", "communication", "portal", "reports", "dashboard", "hr", "payroll", "library",
           "placement", "hostel", "transport", "cafeteria", "inventory", "security_gate", "wellbeing",
           "accreditation", "lms", "generic"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    task = asyncio.create_task(scheduler_loop()) if SCHEDULER_ENABLED else None
    logger.info("NexusCampus API started (scheduler=%s, jobs=%d)", SCHEDULER_ENABLED, len(JOBS))
    yield
    if task:
        task.cancel()
    await db.pools.close_all()


app = FastAPI(title="NexusCampus API", version="3.0.0", lifespan=lifespan,
              description="Multi-tenant campus platform: Wave 1 modules + platform services (non-AI).")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-Id", "Content-Disposition"])
register_error_handlers(app)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    elapsed = (time.perf_counter() - started) * 1000
    if elapsed > 1500:
        logger.warning("slow_request %s %s %.0fms", request.method, request.url.path, elapsed)
    return response


loaded = []
for name in MODULES:
    try:
        module = importlib.import_module(f"services.modules.{name}")
    except ModuleNotFoundError as exc:
        if exc.name == f"services.modules.{name}":
            continue
        raise
    for attr in ("router", "files_router", "notifications_router", "public_router", "core_router"):
        if hasattr(module, attr):
            app.include_router(getattr(module, attr))
    loaded.append(name)

# Transitional core service bridge so existing UI operations remain 100% workable
try:
    from ..core_service.routes import router as legacy_core_router
    app.include_router(legacy_core_router)
    loaded.append("core_service")
except Exception as exc:  # noqa: BLE001
    logger.warning("Could not mount legacy core_service: %s", exc)


@app.get("/health", tags=["Health"])
async def health():
    status = {"master": False, "tenants": 0, "template": False}
    try:
        tenants = await tenancy.list_tenants()
        status["master"] = True
        status["tenants"] = len(tenants)
        status["active_tenants"] = sum(1 for t in tenants if t["status"] == "active")
        admin = await db.admin_connect(MASTER_DB)
        try:
            status["template"] = bool(await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", TEMPLATE_DB))
        finally:
            await admin.close()
    except Exception as exc:  # noqa: BLE001
        status["error"] = str(exc)[:200]
    healthy = status["master"] and status["template"]
    return {"status": "online" if healthy else "degraded", "version": app.version, "databases": status,
            "modules_loaded": loaded, "routes": len(app.routes), "jobs": sorted(JOBS), "scheduler": SCHEDULER_ENABLED}


@app.get("/api/v1/meta", tags=["Health"])
async def meta():
    return {"version": app.version, "ai_enabled": AI_ENABLED, "demo_mode": DEMO_MODE, "modules_loaded": loaded}
