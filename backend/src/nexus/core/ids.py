"""Record ids: opaque text `<prefix>_<ULID>` (contract `Id`: 1 to 128 chars). ULIDs sort by creation time.

Demo seed rows keep the mock ids (`ten-ls`, `ins-rv`, …) so the screens and the backend share them.
"""

import re
import secrets
import time

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_PREFIX = re.compile(r"^[a-z][a-z0-9]{1,15}$")


def ulid(now_ms: int | None = None) -> str:
    """26-char Crockford base32: 48-bit millisecond time + 80 random bits."""
    ms = int(time.time() * 1000) if now_ms is None else now_ms
    value = (ms << 80) | secrets.randbits(80)
    chars = []
    for _ in range(26):
        chars.append(_CROCKFORD[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def new_id(prefix: str) -> str:
    """`new_id("ten")` → `ten_01J…`."""
    if not _PREFIX.fullmatch(prefix):
        raise ValueError(f"invalid id prefix: {prefix!r}")
    return f"{prefix}_{ulid()}"
