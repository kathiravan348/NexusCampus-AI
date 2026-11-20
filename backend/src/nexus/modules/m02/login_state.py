"""One-time login state (state → PKCE verifier, nonce, returnTo) between `/auth/login` and `/auth/callback`.

Kept in Redis for 10 minutes and deleted when read (`GETDEL`), so a callback can never be replayed.
"""

import json
from typing import Any, Protocol

from redis.asyncio import Redis

TTL_SECONDS = 600
_PREFIX = "nexus:login-state:"


class LoginStateStore(Protocol):
    async def put(self, state: str, data: dict[str, Any]) -> None: ...

    async def pop(self, state: str) -> dict[str, Any] | None: ...


class RedisLoginStateStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def put(self, state: str, data: dict[str, Any]) -> None:
        await self._redis.set(_PREFIX + state, json.dumps(data), ex=TTL_SECONDS)

    async def pop(self, state: str) -> dict[str, Any] | None:
        raw = await self._redis.getdel(_PREFIX + state)
        if raw is None:
            return None
        value: dict[str, Any] = json.loads(raw)
        return value


class MemoryLoginStateStore:
    """For tests only."""

    def __init__(self) -> None:
        self.data: dict[str, dict[str, Any]] = {}

    async def put(self, state: str, data: dict[str, Any]) -> None:
        self.data[state] = data

    async def pop(self, state: str) -> dict[str, Any] | None:
        return self.data.pop(state, None)
