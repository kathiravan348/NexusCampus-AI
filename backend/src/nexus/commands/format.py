"""Signed Control → deployment command format (`nexus-command/1`, D60, NEX-128).

Signed bytes = `nexus-command/1\\n` + canonical JSON of the command payload (domain-separated from licences and
releases). Private signing keys live in OpenBao Transit (`nexus-command`, Ed25519, never exported) and the payload
carries `signingKeyId` (`nexus-command:v<N>`) so install agents verify offline against pinned public keys.
"""

import base64
import json
import secrets
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError
from pydantic.alias_generators import to_camel

from nexus.core.vault import Vault
from nexus.licensing.canonical import canonical_json
from nexus.licensing.licence import key_id

FORMAT = "nexus-command/1"
_PREFIX = f"{FORMAT}\n".encode()
DEFAULT_KEY = "nexus-command"
MAX_ARGS_BYTES = 2048
MAX_RESULT_BYTES = 4096
MAX_TTL = timedelta(hours=24)

CommandId = Annotated[str, StringConstraints(pattern=r"^cmd-[0-9a-f]{16}$")]
EntityId = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]
CommandKind = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9._-]{0,63}$")]
UtcIso = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")]
ActorRef = Annotated[str, StringConstraints(min_length=1, max_length=128)]
KeyId = Annotated[str, StringConstraints(min_length=1, max_length=64)]


class CommandVerificationError(ValueError):
    """Raised when a signed command fails format, signature, key, size, or lifetime checks."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class CommandPayload(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)

    format: Literal["nexus-command/1"] = "nexus-command/1"
    id: CommandId
    deployment_id: EntityId
    tenant_id: EntityId | None = None
    kind: CommandKind
    args: dict[str, Any]
    issued_at: UtcIso
    expires_at: UtcIso
    issued_by: ActorRef
    signing_key_id: KeyId


def new_command_id() -> str:
    return f"cmd-{secrets.token_hex(8)}"


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _check_args_and_window(cmd: CommandPayload) -> tuple[datetime, datetime]:
    try:
        args_bytes = canonical_json(cmd.args)
    except TypeError as exc:
        raise CommandVerificationError("invalid_args", str(exc)) from None
    if len(args_bytes) > MAX_ARGS_BYTES:
        raise CommandVerificationError("args_too_large", f"Command args exceed {MAX_ARGS_BYTES} bytes.")
    try:
        issued = _parse_utc(cmd.issued_at)
        expires = _parse_utc(cmd.expires_at)
    except ValueError:
        raise CommandVerificationError("invalid_timestamp", "Invalid ISO-8601 UTC timestamp.") from None
    if expires <= issued:
        raise CommandVerificationError("invalid_window", "expiresAt must be after issuedAt.")
    if (expires - issued) > MAX_TTL:
        raise CommandVerificationError("ttl_exceeded", "Command lifetime cannot exceed 24 hours.")
    return issued, expires


async def sign_command(vault: Vault, key_name: str, cmd: CommandPayload) -> tuple[str, str]:
    """Stamps `signingKeyId` with the latest Transit version, canonicalises, and signs `cmd`."""
    _check_args_and_window(cmd)
    await vault.create_signing_key(key_name)
    version = max(await vault.public_keys(key_name))
    stamped = cmd.model_copy(update={"signing_key_id": key_id(key_name, version)})
    raw = canonical_json(stamped.model_dump(by_alias=True))
    token = await vault.sign(key_name, _PREFIX + raw)
    _, used, signature = token.split(":", 2)
    if used != f"v{version}":
        raise RuntimeError("command signing key rotated while signing; retry")
    return raw.decode("utf-8"), signature


def verify_command(
    raw: str | bytes,
    signature: str,
    keys: Mapping[str, bytes],
    now: datetime | None = None,
) -> CommandPayload:
    """Verifies a raw canonical command payload + Ed25519 signature against pinned public keys."""
    raw_bytes = raw.encode("utf-8") if isinstance(raw, str) else raw
    try:
        parsed = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CommandVerificationError("invalid_json", "Command payload is not valid UTF-8 JSON.") from None
    if not isinstance(parsed, dict):
        raise CommandVerificationError("invalid_json", "Command payload must be a JSON object.")
    if parsed.get("format") != FORMAT:
        raise CommandVerificationError("wrong_format", f"Unsupported command format: {parsed.get('format')!r}.")

    try:
        cmd = CommandPayload.model_validate(parsed)
    except ValidationError as exc:
        raise CommandVerificationError("invalid_payload", str(exc)) from None

    _, expires = _check_args_and_window(cmd)

    try:
        expected_canonical = canonical_json(parsed)
    except TypeError as exc:
        raise CommandVerificationError("invalid_payload", str(exc)) from None
    if raw_bytes != expected_canonical:
        raise CommandVerificationError("non_canonical", "Command payload is not canonical JSON.")

    public_key = keys.get(cmd.signing_key_id)
    if public_key is None:
        raise CommandVerificationError("unknown_key", f"Unknown signing key: {cmd.signing_key_id}.")

    try:
        sig_bytes = base64.b64decode(signature, validate=True)
        if len(sig_bytes) != 64:
            raise CommandVerificationError("bad_signature", "Signature length is invalid.")
        Ed25519PublicKey.from_public_bytes(public_key).verify(sig_bytes, _PREFIX + raw_bytes)
    except (InvalidSignature, ValueError):
        raise CommandVerificationError("bad_signature", "Command signature verification failed.") from None

    check_now = (now or datetime.now(UTC)).astimezone(UTC)
    if expires <= check_now:
        raise CommandVerificationError("expired", "Command has expired.")

    return cmd


async def public_key_file(vault: Vault, key_name: str = DEFAULT_KEY) -> dict[str, str]:
    """`{keyId: base64 public key}` — pinned on deployments (contains public keys only)."""
    return {
        key_id(key_name, v): base64.b64encode(raw).decode() for v, raw in (await vault.public_keys(key_name)).items()
    }


def load_public_keys(data: Mapping[str, str]) -> dict[str, bytes]:
    return {k: base64.b64decode(v) for k, v in data.items()}
