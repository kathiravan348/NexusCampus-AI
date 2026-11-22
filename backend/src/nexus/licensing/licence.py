"""Licence files (`nexus-licence/1`), mirroring `LicenceFileSchema` in `@nexus/contracts` (control/licence.ts).

Signed message = `nexus-licence/1\\n` + canonical JSON of the payload (the prefix keeps a licence signature from
ever being valid for another kind of message). The signature is raw Ed25519 (64 bytes, base64). `signingKeyId` is
`<vault key name>:v<version>`, so installs can hold several public keys across key rotations.

Offline states (D23): before expiry (or perpetual) → `active`; up to `graceDays` after expiry → `grace`; later →
`read_only` (data stays readable, never lost). Revocation and `expired` are Nexus Control states, not offline ones.
"""

import base64
import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

from nexus.core.vault import Vault
from nexus.licensing.canonical import canonical_json

FORMAT: Literal["nexus-licence/1"] = "nexus-licence/1"
_PREFIX = f"{FORMAT}\n".encode()

IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
UtcDateTime = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$")]
ModuleId = Annotated[str, StringConstraints(pattern=r"^[MP](0[1-9]|[1-9]\d)$")]
Id = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class LicenceTerms(_Camel):
    """What the licence allows (the signed payload)."""

    id: Id
    account_id: Id
    edition: Literal["standard", "enterprise"]
    modules: list[ModuleId] = Field(min_length=1)
    learner_cap: int = Field(ge=1)
    campus_cap: int = Field(ge=1)
    issued_at: UtcDateTime
    #: None = perpetual (support and updates still end at `support_ends_at`).
    expires_at: IsoDate | None
    support_ends_at: IsoDate
    grace_days: int = Field(ge=0, le=90)
    activation: Literal["online", "offline"]
    signing_key_id: str = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def _valid_terms(self) -> "LicenceTerms":
        if len(set(self.modules)) != len(self.modules):
            raise ValueError("modules must be unique")
        if self.expires_at is not None and self.expires_at < self.issued_at[:10]:
            raise ValueError("expiry must be on or after issue")
        return self

    def payload(self) -> dict[str, object]:
        return self.model_dump(by_alias=True)


class LicenceFile(_Camel):
    """The file an install loads."""

    format: Literal["nexus-licence/1"]
    payload: LicenceTerms
    signature: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9+/]{86}==$")]

    def to_json(self) -> str:
        return canonical_json(self.model_dump(by_alias=True)).decode()


def signed_message(terms: LicenceTerms) -> bytes:
    return _PREFIX + canonical_json(terms.payload())


def key_id(name: str, version: int) -> str:
    return f"{name}:v{version}"


async def issue_licence(terms: LicenceTerms, vault: Vault, key_name: str) -> LicenceFile:
    """Signs `terms` with the newest version of `key_name` in Transit; the private key never leaves the vault."""
    await vault.create_signing_key(key_name)
    version = max(await vault.public_keys(key_name))
    signed = terms.model_copy(update={"signing_key_id": key_id(key_name, version)})
    token = await vault.sign(key_name, signed_message(signed))
    _, used, blob = token.split(":", 2)
    if used != f"v{version}":  # rotated between the two calls: the payload would name the wrong key
        raise RuntimeError("signing key rotated while signing; retry")
    return LicenceFile(format=FORMAT, payload=signed, signature=blob)


def fingerprint(file: LicenceFile) -> str:
    """SHA-256 hex of the canonical file (shown in Nexus Control as `Licence.fingerprint`)."""
    return hashlib.sha256(file.to_json().encode()).hexdigest()


OfflineState = Literal["active", "grace", "read_only"]


@dataclass(frozen=True)
class LicenceCheck:
    valid: bool
    #: Why it is not valid: `unknown_key` or `bad_signature`; None when valid.
    problem: Literal["unknown_key", "bad_signature"] | None
    state: OfflineState | None
    grace_ends_on: date | None


def offline_state(terms: LicenceTerms, today: date) -> tuple[OfflineState, date | None]:
    if terms.expires_at is None:
        return "active", None
    expires = date.fromisoformat(terms.expires_at)
    grace_end = expires + timedelta(days=terms.grace_days)
    if today <= expires:
        return "active", None
    if today <= grace_end:
        return "grace", grace_end
    return "read_only", None


def verify_licence(
    file: LicenceFile, public_keys: Mapping[str, bytes], today: date, raw_payload: Mapping[str, Any] | None = None
) -> LicenceCheck:
    """Offline check with public keys only (key id → raw 32-byte Ed25519 key).

    Pass `raw_payload` (the payload exactly as read from the file) so a licence signed before a field was added still
    verifies: the signature covers those bytes, not this code's re-serialisation.
    """
    raw = public_keys.get(file.payload.signing_key_id)
    if raw is None:
        return LicenceCheck(False, "unknown_key", None, None)
    message = _PREFIX + canonical_json(dict(raw_payload)) if raw_payload is not None else signed_message(file.payload)
    try:
        Ed25519PublicKey.from_public_bytes(raw).verify(base64.b64decode(file.signature), message)
    except (InvalidSignature, ValueError):
        return LicenceCheck(False, "bad_signature", None, None)
    state, grace_end = offline_state(file.payload, today)
    return LicenceCheck(True, None, state, grace_end)
