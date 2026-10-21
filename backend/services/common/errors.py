"""
Standardised errors + central logging.
- Every error response: {"error": {code, message, details, request_id}}.
- Every unhandled error is logged with module, tenant, user and action context.
"""
import logging
import logging.handlers

import asyncpg
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import LOG_DIR

logger = logging.getLogger("nexus")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def not_found(entity: str = "Record") -> AppError:
    return AppError(404, "not_found", f"{entity} not found")


def forbidden(message: str = "You do not have permission to perform this action") -> AppError:
    return AppError(403, "forbidden", message)


def bad_request(message: str, code: str = "invalid_request", details=None) -> AppError:
    return AppError(400, code, message, details)


def conflict(message: str, code: str = "conflict", details=None) -> AppError:
    return AppError(409, code, message, details)


def configure_logging() -> None:
    if getattr(configure_logging, "_done", False):
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    file_handler = logging.handlers.RotatingFileHandler(LOG_DIR / "app.log", maxBytes=5_000_000, backupCount=3,
                                                        encoding="utf-8")
    file_handler.setFormatter(fmt)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    logger.setLevel(logging.INFO)
    logger.addHandler(file_handler)
    logger.addHandler(console)
    logger.propagate = False
    configure_logging._done = True


def _context(request: Request) -> dict:
    parts = request.url.path.split("/")
    return {
        "request_id": getattr(request.state, "request_id", None),
        "tenant": getattr(request.state, "tenant_slug", None),
        "user": getattr(request.state, "user_id", None),
        "module": parts[3] if len(parts) > 3 else "root",
        "action": f"{request.method} {request.url.path}",
    }


def _response(request: Request, status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {
        "code": code, "message": message, "details": jsonable_encoder(details),
        "request_id": getattr(request.state, "request_id", None)}})


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        if exc.status >= 500:
            logger.error("app_error %s %s", exc.code, _context(request))
        return _response(request, exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        code = {401: "unauthenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error")
        return _response(request, exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        errors = [{"field": ".".join(str(p) for p in e.get("loc", [])[1:]), "message": e.get("msg")}
                  for e in exc.errors()]
        message = errors[0]["message"] if errors else "Invalid input"
        if errors and errors[0]["field"]:
            message = f"{errors[0]['field']}: {message}"
        return _response(request, 422, "validation_error", message, errors)

    @app.exception_handler(asyncpg.exceptions.UniqueViolationError)
    async def _unique(request: Request, exc: asyncpg.exceptions.UniqueViolationError):
        return _response(request, 409, "duplicate", "A record with the same unique value already exists",
                         {"constraint": exc.constraint_name})

    @app.exception_handler(asyncpg.exceptions.ForeignKeyViolationError)
    async def _fk(request: Request, exc: asyncpg.exceptions.ForeignKeyViolationError):
        return _response(request, 422, "invalid_reference", "A referenced record does not exist",
                         {"constraint": exc.constraint_name})

    @app.exception_handler(asyncpg.exceptions.CheckViolationError)
    async def _check(request: Request, exc: asyncpg.exceptions.CheckViolationError):
        return _response(request, 422, "invalid_value", "A value is outside the allowed range",
                         {"constraint": exc.constraint_name})

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("unhandled_error %s", _context(request))
        return _response(request, 500, "internal_error", "Something went wrong. The error has been logged.")
