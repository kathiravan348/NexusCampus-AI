"""Per-tenant audit hash chain (ARCHITECTURE §6, D25), identical to the mocks' `auditHashInput`:

    hash = sha256_hex(f"{id}|{occurredAt}|{action}|{prevHash or ''}")

`occurredAt` is the contract's UTC text: `2026-05-04T06:00:00Z`, or `…:00.123Z` when milliseconds are not zero
(JavaScript `toISOString()` with `.000Z` shortened, as the mocks write it). The hash covers ids and metadata
only, never personal values, so crypto-shredding personal data never breaks the chain.
"""

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def normalize_instant(value: datetime) -> datetime:
    """UTC, truncated to milliseconds (what the contract text can express)."""
    if value.tzinfo is None:
        raise ValueError("audit times must be timezone-aware")
    utc = value.astimezone(UTC)
    return utc.replace(microsecond=utc.microsecond // 1000 * 1000)


def format_instant(value: datetime) -> str:
    utc = normalize_instant(value)
    ms = utc.microsecond // 1000
    base = utc.strftime("%Y-%m-%dT%H:%M:%S")
    return f"{base}Z" if ms == 0 else f"{base}.{ms:03d}Z"


def audit_hash(event_id: str, occurred_at: datetime, action: str, prev_hash: str | None) -> str:
    data = f"{event_id}|{format_instant(occurred_at)}|{action}|{prev_hash or ''}"
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ChainCheck:
    ok: bool
    checked: int
    #: Id of the first row whose link or hash is wrong; None when the chain is intact.
    broken_at: str | None = None


async def verify_chain(
    session: AsyncSession, tenant_id: str, from_seq: int = 1, to_seq: int | None = None
) -> ChainCheck:
    """Recomputes every link in `[from_seq, to_seq]` of the tenant's chain (needs that tenant's context).

    The first row of a partial range trusts its stored `prev_hash`; every later row must point at the hash of
    the row before it, and every stored hash must equal the recomputed one. Sequence numbers must be gapless.
    """
    rows = (
        await session.execute(
            text(
                "SELECT id, seq, occurred_at, action, prev_hash, hash FROM audit_events "
                "WHERE tenant_id = :t AND seq >= :lo AND (CAST(:hi AS bigint) IS NULL OR seq <= :hi) "
                "ORDER BY seq"
            ),
            {"t": tenant_id, "lo": from_seq, "hi": to_seq},
        )
    ).all()
    previous: str | None = None
    expected_seq = from_seq
    for index, (event_id, seq, occurred_at, action, prev_hash, stored) in enumerate(rows):
        if seq != expected_seq:
            return ChainCheck(ok=False, checked=index, broken_at=event_id)
        if index == 0 and from_seq == 1 and prev_hash is not None:
            return ChainCheck(ok=False, checked=index, broken_at=event_id)
        if index > 0 and prev_hash != previous:
            return ChainCheck(ok=False, checked=index, broken_at=event_id)
        if audit_hash(event_id, occurred_at, action, prev_hash) != stored:
            return ChainCheck(ok=False, checked=index, broken_at=event_id)
        previous = stored
        expected_seq += 1
    return ChainCheck(ok=True, checked=len(rows))
