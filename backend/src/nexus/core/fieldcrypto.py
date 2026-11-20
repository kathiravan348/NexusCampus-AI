"""Field encryption for sensitive data (ARCHITECTURE §10, V-2): health, safeguarding, ID numbers, bank details.

Envelope encryption: a 256-bit data key from Vault (wrapped by the tenant's Transit key) encrypts the value with
AES-GCM; the field path is bound as associated data, so a ciphertext cannot be moved to another field. Stored text:

    v1:<keyVersion>:<wrapped data key, base64>:<nonce + ciphertext, base64>

Data keys are cached in memory for 5 minutes per tenant key (fewer Vault calls); unwrapped keys are cached by their
wrapped form. Destroying the tenant key (crypto-shred) makes every value unreadable — the audit chain does not
depend on them. Blind indexes (`blind_index`) allow exact-match search without decrypting.
"""

import base64
import os
import time
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from nexus.core.vault import DataKey, KeyDestroyed, Vault

PREFIX = "v1"
CACHE_SECONDS = 300


class FieldUnreadable(Exception):
    """Wrong key, wrong field, tampered text, or a destroyed key."""


@dataclass
class _Cached:
    key: DataKey
    expires: float


class FieldCipher:
    def __init__(self, vault: Vault) -> None:
        self._vault = vault
        self._current: dict[str, _Cached] = {}
        self._unwrapped: dict[str, bytes] = {}

    async def _data_key(self, key_name: str) -> DataKey:
        cached = self._current.get(key_name)
        if cached is None or cached.expires < time.monotonic():
            dk = await self._vault.data_key(key_name)
            cached = _Cached(dk, time.monotonic() + CACHE_SECONDS)
            self._current[key_name] = cached
            self._unwrapped[f"{key_name}|{dk.wrapped}"] = dk.plaintext
        return cached.key

    async def encrypt(self, key_name: str, field: str, value: str) -> str:
        dk = await self._data_key(key_name)
        nonce = os.urandom(12)
        sealed = AESGCM(dk.plaintext).encrypt(nonce, value.encode("utf-8"), field.encode("utf-8"))
        wrapped = base64.b64encode(dk.wrapped.encode("ascii")).decode()
        return f"{PREFIX}:{dk.version}:{wrapped}:{base64.b64encode(nonce + sealed).decode()}"

    async def decrypt(self, key_name: str, field: str, stored: str) -> str:
        try:
            prefix, _, wrapped_b64, body_b64 = stored.split(":")
            if prefix != PREFIX:
                raise ValueError(prefix)
            wrapped = base64.b64decode(wrapped_b64).decode("ascii")
            body = base64.b64decode(body_b64)
        except ValueError as exc:
            raise FieldUnreadable("malformed") from exc
        cache_key = f"{key_name}|{wrapped}"
        dk = self._unwrapped.get(cache_key)
        if dk is None:
            try:
                dk = await self._vault.unwrap(key_name, wrapped)
            except KeyDestroyed as exc:
                raise FieldUnreadable("key unavailable") from exc
            self._unwrapped[cache_key] = dk
        try:
            return AESGCM(dk).decrypt(body[:12], body[12:], field.encode("utf-8")).decode("utf-8")
        except InvalidTag as exc:
            raise FieldUnreadable("tampered or wrong field") from exc

    def forget(self, key_name: str) -> None:
        """Drop cached keys (after rotate or destroy)."""
        self._current.pop(key_name, None)
        for k in [k for k in self._unwrapped if k.startswith(f"{key_name}|")]:
            del self._unwrapped[k]

    async def blind_index(self, key_name: str, field: str, value: str) -> str:
        """Deterministic HMAC of a normalised value for exact-match lookups (`field` keeps fields apart)."""
        return await self._vault.hmac(key_name, f"{field}|{value.strip().lower()}")
