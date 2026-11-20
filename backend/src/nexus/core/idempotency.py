"""Idempotency keys for writes the app may replay from its offline queue (NEX-056, ARCHITECTURE §8).

The first request with a key is applied and its response stored; a replay with the same key and the same body gets
the stored response without applying it again (no second audit row). The same key with a different body is a
client bug → `409 conflict`. Keys are per tenant, under RLS.
"""

import hashlib
import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.errors import ApiError, ApiErrorDetail

HEADER = "Idempotency-Key"
MAX_KEY = 128


def request_hash(method: str, path: str, body: Any) -> str:
    canonical = json.dumps([method, path, body], sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def check_key(key: str) -> str:
    if not 1 <= len(key) <= MAX_KEY or not key.isprintable():
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path=HEADER, message=f"Must be 1 to {MAX_KEY} printable characters")],
        )
    return key


async def replayed(db: AsyncSession, key: str, digest: str) -> Any | None:
    """The stored response for `key`, or None when the key is new. Same key, other body → 409."""
    row = (
        await db.execute(text("SELECT request_hash, response FROM idempotency_keys WHERE key = :k"), {"k": key})
    ).first()
    if row is None:
        return None
    if row.request_hash != digest:
        message = "This Idempotency-Key was used for a different request"
        raise ApiError(409, "conflict", message, [ApiErrorDetail(path=HEADER, message=message)])
    return row.response


async def remember(
    db: AsyncSession, tenant_id: str, user_id: str, key: str, digest: str, response: Any, status_code: int = 200
) -> None:
    await db.execute(
        text(
            "INSERT INTO idempotency_keys (tenant_id, key, user_id, request_hash, status_code, response) "
            "VALUES (:t, :k, :u, :h, :s, CAST(:r AS jsonb))"
        ),
        {"t": tenant_id, "k": key, "u": user_id, "h": digest, "s": status_code, "r": json.dumps(response)},
    )
