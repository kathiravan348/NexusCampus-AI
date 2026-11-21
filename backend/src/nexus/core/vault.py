"""Vault Transit client (D46, ARCHITECTURE §10): per-tenant key-encryption keys that never leave Vault.

Operations: create a key, issue a wrapped data key, unwrap it, HMAC (blind indexes), rotate, destroy (crypto-shred),
and Ed25519 signatures (audit checkpoints, NEX-065) with a signing key that never leaves Vault either.
Key material is never logged or returned by the API. `FakeVault` (real AES-GCM in memory) is for tests.
"""

import base64
import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

import httpx2
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from nexus.core.errors import ApiError
from nexus.settings import Settings


class KeyDestroyed(Exception):
    """The key is gone (crypto-shredded) or never existed: its data can never be read again."""


@dataclass(frozen=True)
class DataKey:
    plaintext: bytes  # 32 bytes, kept in memory only
    wrapped: str  # Vault ciphertext `vault:v<N>:…`
    version: int


@dataclass(frozen=True)
class KeyInfo:
    latest_version: int
    created_at: datetime
    rotated_at: datetime | None


class Vault(Protocol):
    async def create_key(self, name: str) -> None: ...
    async def data_key(self, name: str) -> DataKey: ...
    async def unwrap(self, name: str, wrapped: str) -> bytes: ...
    async def hmac(self, name: str, value: str) -> str: ...
    async def rotate(self, name: str) -> None: ...
    async def destroy(self, name: str) -> None: ...
    async def info(self, name: str) -> KeyInfo: ...
    async def create_signing_key(self, name: str) -> None: ...
    async def sign(self, name: str, data: bytes) -> str: ...
    async def verify(self, name: str, data: bytes, signature: str) -> bool: ...


def key_name(tenant_id: str, purpose: str) -> str:
    return f"tenant-{tenant_id}-{purpose.replace('_', '-')}"


class HttpVault:
    def __init__(self, settings: Settings, http: httpx2.AsyncClient) -> None:
        self._base = f"{settings.vault_url.rstrip('/')}/v1/{settings.vault_transit_mount}"
        self._mount = settings.vault_transit_mount
        self._root = f"{settings.vault_url.rstrip('/')}/v1"
        self._headers = {"X-Vault-Token": settings.vault_token.get_secret_value()}
        self._http = http

    async def _call(self, method: str, url: str, json: dict[str, object] | None = None) -> httpx2.Response:
        try:
            return await self._http.request(method, url, headers=self._headers, json=json)
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "The key service is not reachable.") from exc

    async def _ok(self, method: str, url: str, json: dict[str, object] | None = None) -> dict[str, object]:
        res = await self._call(method, url, json)
        # Vault answers 404 for an unknown key on reads, 400 "…not found" on crypto operations.
        missing = res.status_code == 404 or (
            res.status_code == 400 and ("/decrypt/" in url or "not found" in res.text.lower())
        )
        if missing:  # unknown (destroyed) key, or ciphertext from a key that no longer exists
            raise KeyDestroyed(url.rsplit("/", 1)[-1])
        if res.status_code >= 300:
            raise ApiError(503, "internal", "The key service refused the request.")
        body: dict[str, object] = res.json() if res.content else {}
        return body

    async def ensure_mount(self) -> None:
        res = await self._call("GET", f"{self._root}/sys/mounts/{self._mount}")
        if res.status_code != 200:
            await self._call("POST", f"{self._root}/sys/mounts/{self._mount}", {"type": "transit"})

    async def create_key(self, name: str) -> None:
        await self.ensure_mount()
        res = await self._call("POST", f"{self._base}/keys/{name}", {"type": "aes256-gcm96", "exportable": False})
        if res.status_code >= 300:
            raise ApiError(503, "internal", "The key service could not create the key.")

    async def data_key(self, name: str) -> DataKey:
        data = (await self._ok("POST", f"{self._base}/datakey/plaintext/{name}", {"bits": 256}))["data"]
        assert isinstance(data, dict)
        wrapped = str(data["ciphertext"])
        return DataKey(base64.b64decode(str(data["plaintext"])), wrapped, int(wrapped.split(":")[1][1:]))

    async def unwrap(self, name: str, wrapped: str) -> bytes:
        data = (await self._ok("POST", f"{self._base}/decrypt/{name}", {"ciphertext": wrapped}))["data"]
        assert isinstance(data, dict)
        return base64.b64decode(str(data["plaintext"]))

    async def hmac(self, name: str, value: str) -> str:
        payload: dict[str, object] = {"input": base64.b64encode(value.encode()).decode(), "algorithm": "sha2-256"}
        data = (await self._ok("POST", f"{self._base}/hmac/{name}", payload))["data"]
        assert isinstance(data, dict)
        return str(data["hmac"]).rsplit(":", 1)[-1]

    async def rotate(self, name: str) -> None:
        await self._ok("POST", f"{self._base}/keys/{name}/rotate")

    async def destroy(self, name: str) -> None:
        await self._ok("POST", f"{self._base}/keys/{name}/config", {"deletion_allowed": True})
        await self._ok("DELETE", f"{self._base}/keys/{name}")

    async def info(self, name: str) -> KeyInfo:
        data = (await self._ok("GET", f"{self._base}/keys/{name}"))["data"]
        assert isinstance(data, dict)
        versions = data["keys"]
        assert isinstance(versions, dict)
        times = sorted(
            datetime.fromtimestamp(int(t), UTC) if isinstance(t, int) else datetime.fromisoformat(str(t))
            for t in versions.values()
        )
        return KeyInfo(int(str(data["latest_version"])), times[0], times[-1] if len(times) > 1 else None)

    async def create_signing_key(self, name: str) -> None:
        """Creates an Ed25519 Transit key (no-op when it exists)."""
        await self.ensure_mount()
        res = await self._call("POST", f"{self._base}/keys/{name}", {"type": "ed25519", "exportable": False})
        if res.status_code >= 300:
            raise ApiError(503, "internal", "The key service could not create the signing key.")

    async def sign(self, name: str, data: bytes) -> str:
        """Ed25519 signature `vault:v<N>:<base64>` (the version names the key that signed)."""
        payload: dict[str, object] = {"input": base64.b64encode(data).decode()}
        body = (await self._ok("POST", f"{self._base}/sign/{name}", payload))["data"]
        assert isinstance(body, dict)
        return str(body["signature"])

    async def verify(self, name: str, data: bytes, signature: str) -> bool:
        payload: dict[str, object] = {"input": base64.b64encode(data).decode(), "signature": signature}
        res = await self._call("POST", f"{self._base}/verify/{name}", payload)
        if res.status_code == 400:  # malformed signature or unknown key version: not valid
            return False
        if res.status_code >= 300:
            raise ApiError(503, "internal", "The key service refused the request.")
        return bool(res.json()["data"]["valid"])


class FakeVault:
    """In-memory Transit stand-in with real AES-GCM wrapping (tests, no container needed)."""

    def __init__(self) -> None:
        self.keys: dict[str, list[bytes]] = {}
        self.created: dict[str, datetime] = {}
        self.signing: dict[str, list[Ed25519PrivateKey]] = {}

    async def create_key(self, name: str) -> None:
        self.keys.setdefault(name, [os.urandom(32)])
        self.created.setdefault(name, datetime.now(UTC))

    def _key(self, name: str, version: int | None = None) -> tuple[bytes, int]:
        versions = self.keys.get(name)
        if not versions:
            raise KeyDestroyed(name)
        v = version or len(versions)
        return versions[v - 1], v

    async def data_key(self, name: str) -> DataKey:
        kek, v = self._key(name)
        dk, nonce = os.urandom(32), os.urandom(12)
        wrapped = f"vault:v{v}:" + base64.b64encode(nonce + AESGCM(kek).encrypt(nonce, dk, None)).decode()
        return DataKey(dk, wrapped, v)

    async def unwrap(self, name: str, wrapped: str) -> bytes:
        _, ver, blob = wrapped.split(":", 2)
        kek, _ = self._key(name, int(ver[1:]))
        raw = base64.b64decode(blob)
        try:
            return AESGCM(kek).decrypt(raw[:12], raw[12:], None)
        except Exception as exc:
            raise KeyDestroyed(name) from exc

    async def hmac(self, name: str, value: str) -> str:
        kek, _ = self._key(name)
        return base64.b64encode(hmac.new(kek, value.encode(), hashlib.sha256).digest()).decode()

    async def rotate(self, name: str) -> None:
        self._key(name)
        self.keys[name].append(os.urandom(32))

    async def destroy(self, name: str) -> None:
        self.keys.pop(name, None)

    async def info(self, name: str) -> KeyInfo:
        _, v = self._key(name)
        return KeyInfo(v, self.created[name], None)

    async def create_signing_key(self, name: str) -> None:
        self.signing.setdefault(name, [Ed25519PrivateKey.generate()])

    async def sign(self, name: str, data: bytes) -> str:
        versions = self.signing.get(name)
        if not versions:
            raise KeyDestroyed(name)
        return f"vault:v{len(versions)}:" + base64.b64encode(versions[-1].sign(data)).decode()

    async def verify(self, name: str, data: bytes, signature: str) -> bool:
        try:
            _, ver, blob = signature.split(":", 2)
            key = self.signing[name][int(ver[1:]) - 1]
            key.public_key().verify(base64.b64decode(blob), data)
        except (InvalidSignature, KeyError, IndexError, ValueError):
            return False
        return True
