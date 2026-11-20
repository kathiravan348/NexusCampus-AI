"""Idempotency keys for writes the app may replay from its offline outbox (NEX-056 / NEX-057, ARCHITECTURE §5, O-2).

Any guarded unsafe request (`core/permissions.require`) may carry `Idempotency-Key`:

1. In the request's own tenant transaction the guard claims the key (row with `status_code = 0`). The claim commits
   with the write, or rolls back with it — a failed write can be retried with the same key.
2. `IdempotencyRecorder` (middleware) stores the 2xx response on the claimed row after the transaction committed.
3. A replay with the same key and the same request (method, path, query, body bytes) gets the stored response; the
   write is not applied again (no second audit row). Same key, other request → `409 conflict`; a replay while the
   first is still running → `409 conflict` (retry later). Keys expire after 24 h.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from nexus.core import db
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.tenancy import TenantContext, tenant_transaction

HEADER = "Idempotency-Key"
MAX_KEY = 128
TTL = timedelta(hours=24)
UNSAFE = frozenset({"POST", "PUT", "PATCH", "DELETE"})


@dataclass(frozen=True)
class Claim:
    tenant_id: str
    key: str


class Replay(Exception):
    """Raised by the guard to answer with the stored response."""

    def __init__(self, status_code: int, body: Any) -> None:
        super().__init__("idempotent replay")
        self.status_code, self.body = status_code, body


def _conflict(message: str) -> ApiError:
    return ApiError(409, "conflict", message, [ApiErrorDetail(path=HEADER, message=message)])


def check_key(key: str) -> str:
    if not 1 <= len(key) <= MAX_KEY or not key.isprintable():
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path=HEADER, message=f"Must be 1 to {MAX_KEY} printable characters")],
        )
    return key


async def request_hash(request: Request) -> str:
    target = request.url.path + ("?" + request.url.query if request.url.query else "")
    digest = hashlib.sha256(f"{request.method}\n{target}\n".encode())
    digest.update(await request.body())
    return digest.hexdigest()


async def claim(session: AsyncSession, request: Request, tenant_id: str, user_id: str) -> None:
    """Called by the guard inside the request transaction; raises `Replay` or `409` for a used key."""
    key = request.headers.get(HEADER)
    if key is None or request.method not in UNSAFE:
        return
    check_key(key)
    digest = await request_hash(request)
    await session.execute(
        text("DELETE FROM idempotency_keys WHERE key = :k AND created_at < :old"),
        {"k": key, "old": datetime.now(UTC) - TTL},
    )
    claimed = await session.execute(
        text(
            "INSERT INTO idempotency_keys (tenant_id, key, user_id, request_hash, status_code, response) "
            "VALUES (:t, :k, :u, :h, 0, NULL) ON CONFLICT (tenant_id, key) DO NOTHING"
        ),
        {"t": tenant_id, "k": key, "u": user_id, "h": digest},
    )
    if getattr(claimed, "rowcount", 0) == 1:
        request.state.idempotency = Claim(tenant_id, key)
        return
    row = (
        await session.execute(
            text("SELECT request_hash, status_code, response FROM idempotency_keys WHERE key = :k"), {"k": key}
        )
    ).one()
    if row.request_hash != digest:
        raise _conflict("This Idempotency-Key was used for a different request")
    if row.status_code == 0:
        raise _conflict("The first request with this Idempotency-Key is still running; retry shortly")
    raise Replay(int(row.status_code), row.response)


async def _finish(request: Request, claim: Claim, status_code: int, body: bytes) -> None:
    settings = request.app.state.settings
    async with tenant_transaction(db.sessionmaker(), TenantContext(claim.tenant_id), settings) as session:
        if 200 <= status_code < 300:
            stored = json.loads(body) if body else None
            await session.execute(
                text("UPDATE idempotency_keys SET status_code = :s, response = CAST(:r AS jsonb) WHERE key = :k"),
                {"s": status_code, "r": json.dumps(stored), "k": claim.key},
            )
        else:  # not applied (or not cleanly): free the key for a retry
            await session.execute(text("DELETE FROM idempotency_keys WHERE key = :k"), {"k": claim.key})


class IdempotencyRecorder(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        claimed: Claim | None = getattr(request.state, "idempotency", None)
        if claimed is None:
            return response
        body = b"".join([chunk async for chunk in response.body_iterator])  # type: ignore[attr-defined]
        await _finish(request, claimed, response.status_code, body)
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(content=body, status_code=response.status_code, headers=headers)


def install_idempotency(app: FastAPI) -> None:
    async def replay(_: Request, exc: Exception) -> Response:
        assert isinstance(exc, Replay)
        if exc.body is None:
            return Response(status_code=exc.status_code, headers={"Idempotent-Replay": "true"})
        return JSONResponse(exc.body, status_code=exc.status_code, headers={"Idempotent-Replay": "true"})

    app.add_exception_handler(Replay, replay)
    app.add_middleware(IdempotencyRecorder)
