"""Abuse limits for the public enquiry form (D81): fixed windows in Valkey, failing closed.

Keys hold only SHA-256 hashes of the client IP and the form id (`m12:pub:ip:<hash>` for posts,
`m12:pub:ip:get:<hash>` for form reads, `m12:pub:form:<hash>`);
an IP, a form id or form input is never logged or stored. Counting happens before the form lookup, so a `429`
never tells a scraper which ids exist.
"""

import hashlib
import logging
from dataclasses import dataclass
from typing import Protocol

from fastapi import Request
from redis.asyncio import Redis

from nexus.core.redis import init_redis

log = logging.getLogger("nexus.m12.ratelimit")

TEN_MINUTES = 600
ONE_HOUR = 3600


@dataclass(frozen=True)
class Window:
    scope: str  # "ip" (posts), "ip:get" (form reads) or "form"
    limit: int
    seconds: int


POST_LIMITS = (Window("ip", 5, TEN_MINUTES), Window("form", 100, ONE_HOUR))
GET_LIMITS = (Window("ip:get", 60, TEN_MINUTES),)


class Limited(Exception):
    """Over a limit, or the limiter is unavailable (fail closed)."""

    def __init__(self, retry_after: int) -> None:
        super().__init__("rate limited")
        self.retry_after = max(1, retry_after)


class Limiter(Protocol):
    async def hit(self, windows: tuple[Window, ...], ip: str, form_id: str) -> None: ...


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class ValkeyLimiter:
    def __init__(self, redis: Redis, namespace: str = "m12:pub") -> None:
        self._redis = redis
        self._namespace = namespace

    def key(self, scope: str, value: str) -> str:
        return f"{self._namespace}:{scope}:{digest(value)}"

    async def hit(self, windows: tuple[Window, ...], ip: str, form_id: str) -> None:
        keys = [self.key(w.scope, form_id if w.scope == "form" else ip) for w in windows]
        try:
            pipe = self._redis.pipeline(transaction=True)
            for key, window in zip(keys, windows, strict=True):
                pipe.incr(key)
                pipe.expire(key, window.seconds, nx=True)
                pipe.ttl(key)
            replies = await pipe.execute()
        except Exception:
            # Fail closed: without the limiter the form would be an open relay. No key or IP in the log.
            log.warning("public enquiry limiter unavailable")
            raise Limited(TEN_MINUTES) from None
        retry = 0
        for index, window in enumerate(windows):
            count, ttl = int(replies[index * 3]), int(replies[index * 3 + 2])
            if count > window.limit:
                retry = max(retry, ttl if ttl > 0 else window.seconds)
        if retry:
            raise Limited(retry)


def limiter_of(request: Request) -> Limiter:
    """Tests may install `app.state.public_limiter`; otherwise the process's Valkey client."""
    installed: Limiter | None = getattr(request.app.state, "public_limiter", None)
    if installed is not None:
        return installed
    return ValkeyLimiter(init_redis(request.app.state.settings))


def client_ip(request: Request) -> str:
    # Socket address only, until a trusted-proxy setting exists (D81); never a forwarded header.
    return request.client.host if request.client else ""
