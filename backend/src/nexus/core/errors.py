"""The error envelope of every non-2xx response, identical to `frontend/packages/contracts/src/error.ts`.

`{ "error": { "code", "message", "details"?, "requestId"? } }`. Unknown exceptions become
`500 internal` without a stack; validation problems become `400 invalid_request` with dotted field paths.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Literal

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("nexus.errors")

ApiErrorCode = Literal[
    "invalid_request",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "module_disabled",
    "tenant_frozen",
    "rate_limited",
    "internal",
]

REQUEST_ID_HEADER = "X-Request-Id"


class ApiErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str
    message: str = Field(min_length=1)


class ApiErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    code: ApiErrorCode
    message: str = Field(min_length=1)
    details: list[ApiErrorDetail] | None = None
    request_id: str | None = Field(default=None, alias="requestId", min_length=1, max_length=128)


class ApiErrorEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    error: ApiErrorBody


class ApiError(Exception):
    """Raise from any endpoint to return the envelope with this status and code."""

    def __init__(
        self,
        status: int,
        code: ApiErrorCode,
        message: str,
        details: Sequence[ApiErrorDetail] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code: ApiErrorCode = code
        self.message = message
        self.details = list(details) if details is not None else None


_STATUS_CODES: dict[int, ApiErrorCode] = {
    400: "invalid_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "invalid_request",
    409: "conflict",
    422: "invalid_request",
    423: "tenant_frozen",
    429: "rate_limited",
}


def request_id_of(request: Request) -> str:
    value = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) else uuid.uuid4().hex


def error_response(
    request: Request,
    status: int,
    code: ApiErrorCode,
    message: str,
    details: Sequence[ApiErrorDetail] | None = None,
) -> JSONResponse:
    body = ApiErrorEnvelope(
        error=ApiErrorBody(
            code=code,
            message=message,
            details=list(details) if details else None,
            request_id=request_id_of(request),
        )
    )
    return JSONResponse(status_code=status, content=body.model_dump(by_alias=True, exclude_none=True, mode="json"))


def _dotted(loc: Sequence[int | str]) -> str:
    """`("body", "locale", "timeZone")` → `locale.timeZone`; the request part (body/query/path) is dropped."""
    parts = [str(p) for p in loc]
    if parts and parts[0] in {"body", "query", "path", "header", "cookie"}:
        parts = parts[1:]
    return ".".join(parts)


async def _on_api_error(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, ApiError)
    return error_response(request, exc.status, exc.code, exc.message, exc.details)


async def _on_validation(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, RequestValidationError)
    errors: Sequence[Any] = exc.errors()
    details = [
        ApiErrorDetail(path=_dotted(e.get("loc", ())), message=str(e.get("msg") or "Invalid value")) for e in errors
    ]
    return error_response(request, 400, "invalid_request", "The request is not valid.", details)


async def _on_http(request: Request, exc: Exception) -> Response:
    assert isinstance(exc, StarletteHTTPException)
    code = _STATUS_CODES.get(exc.status_code, "internal" if exc.status_code >= 500 else "invalid_request")
    message = exc.detail if isinstance(exc.detail, str) and exc.detail else "Request failed."
    return error_response(request, exc.status_code, code, message)


async def _on_unhandled(request: Request, exc: Exception) -> Response:
    # The stack goes to the server log with the request id, never to the client.
    log.exception("unhandled error (requestId=%s)", request_id_of(request), exc_info=exc)
    return error_response(request, 500, "internal", "Something went wrong.")


def install_error_handling(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_id(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request.state.request_id = uuid.uuid4().hex
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request.state.request_id
        return response

    app.add_exception_handler(ApiError, _on_api_error)
    app.add_exception_handler(RequestValidationError, _on_validation)
    app.add_exception_handler(StarletteHTTPException, _on_http)
    app.add_exception_handler(Exception, _on_unhandled)
