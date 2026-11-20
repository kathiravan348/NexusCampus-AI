"""Redis client (cache, rate limits, short-lived state) — one per process."""

from redis.asyncio import Redis

from nexus.settings import Settings

_client: Redis | None = None


def init_redis(settings: Settings) -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(
            settings.redis_url.get_secret_value(), socket_connect_timeout=3, socket_timeout=3
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None


async def ping_redis() -> bool:
    """True when Redis answers `PING`; never raises (used by `/readyz`)."""
    if _client is None:
        return False
    try:
        return bool(await _client.ping())
    except Exception:
        return False
