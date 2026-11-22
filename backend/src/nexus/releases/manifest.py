"""Release manifests (`nexus-release/1`, NEX-104).

Signed message = `nexus-release/1\\n` + canonical JSON of the manifest (domain-separated from licences). The manifest
pins every image by its content id and, for an offline bundle, every bundled file by SHA-256 and size — so one
signature covers the whole release. `signingKeyId` = `<vault key>:v<version>` so installs can hold several keys.
"""

import base64
from collections.abc import Mapping
from typing import Annotated, Any, Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

from nexus.core.vault import Vault
from nexus.licensing.canonical import canonical_json
from nexus.licensing.licence import key_id

FORMAT = "nexus-release/1"
_PREFIX = f"{FORMAT}\n".encode()
DEFAULT_KEY = "nexus-release"

Semver = Annotated[str, StringConstraints(pattern=r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
UtcDateTime = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")]
Name = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,62}$")]


def safe_path(path: str) -> bool:
    """A bundle path: relative, forward slashes, no `..`, no empty parts, no drive or colon."""
    if not path or path.startswith("/") or "\\" in path or ":" in path:
        return False
    parts = path.split("/")
    return all(p not in ("", ".", "..") for p in parts)


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class ReleaseImage(_Camel):
    #: Service name, e.g. `api`.
    name: Name
    #: What `docker load` restores, e.g. `nexuscampus/api:2.5.0`.
    ref: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    #: The image's content id (`docker image inspect --format {{.Id}}`), checked after loading.
    image_id: Annotated[str, StringConstraints(pattern=r"^sha256:[0-9a-f]{64}$")]


class BundleFile(_Camel):
    path: Annotated[str, StringConstraints(min_length=1, max_length=240)]
    sha256: Sha256Hex
    size: int = Field(ge=0)


class ReleaseManifest(_Camel):
    version: Semver
    channel: Literal["stable", "lts", "preview"]
    #: Oldest version that can upgrade straight to this one (migrations are forward-only).
    min_upgrade_from: Semver
    published_at: UtcDateTime
    images: list[ReleaseImage] = Field(min_length=1)
    #: Alembic heads this release migrates to, e.g. `{"product": "0016_…", "control": "c0005_…"}`.
    migrations: dict[str, str]
    notes_sha256: Sha256Hex
    #: Fixes a security problem: installs show it prominently (M84 `UpdateOffer.securityFix`).
    security_fix: bool = False
    #: Files of the offline bundle (empty for an online-only release).
    files: list[BundleFile] = []
    signing_key_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]

    @model_validator(mode="after")
    def _valid(self) -> "ReleaseManifest":
        if len({i.name for i in self.images}) != len(self.images):
            raise ValueError("image names must be unique")
        paths = [f.path for f in self.files]
        if len(set(paths)) != len(paths):
            raise ValueError("file paths must be unique")
        if not all(safe_path(p) for p in paths):
            raise ValueError("file paths must be relative, without '..'")
        if self.channel == "preview" and self.files:
            raise ValueError("preview releases have no offline bundle")
        return self


class SignedRelease(_Camel):
    format: Literal["nexus-release/1"] = "nexus-release/1"
    manifest: ReleaseManifest
    signature: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9+/]{86}==$")]

    def to_json(self) -> str:
        return canonical_json(self.model_dump(by_alias=True)).decode()


def signed_message(manifest: ReleaseManifest) -> bytes:
    return _PREFIX + canonical_json(manifest.model_dump(by_alias=True))


async def sign_release(manifest: ReleaseManifest, vault: Vault, key_name: str = DEFAULT_KEY) -> SignedRelease:
    """Signs with the newest version of `key_name` in Transit; the private key never leaves the vault."""
    await vault.create_signing_key(key_name)
    version = max(await vault.public_keys(key_name))
    stamped = manifest.model_copy(update={"signing_key_id": key_id(key_name, version)})
    token = await vault.sign(key_name, signed_message(stamped))
    _, used, blob = token.split(":", 2)
    if used != f"v{version}":
        raise RuntimeError("signing key rotated while signing; retry")
    return SignedRelease(manifest=stamped, signature=blob)


def verify_release(
    signed: SignedRelease, public_keys: Mapping[str, bytes], raw_manifest: Mapping[str, Any] | None = None
) -> str | None:
    """None when the signature is valid for a pinned key; else `unknown_key` or `bad_signature`.

    Pass `raw_manifest` (the manifest object exactly as read from the file): the signature covers those bytes, so a
    manifest signed before a field was added (with a default) still verifies.
    """
    raw = public_keys.get(signed.manifest.signing_key_id)
    if raw is None:
        return "unknown_key"
    message = (
        _PREFIX + canonical_json(dict(raw_manifest)) if raw_manifest is not None else signed_message(signed.manifest)
    )
    try:
        Ed25519PublicKey.from_public_bytes(raw).verify(base64.b64decode(signed.signature), message)
    except (InvalidSignature, ValueError):
        return "bad_signature"
    return None


async def public_key_file(vault: Vault, key_name: str = DEFAULT_KEY) -> dict[str, str]:
    """`{keyId: base64 public key}` — the file installs pin (no secret in it)."""
    return {
        key_id(key_name, v): base64.b64encode(raw).decode() for v, raw in (await vault.public_keys(key_name)).items()
    }


def load_public_keys(data: Mapping[str, str]) -> dict[str, bytes]:
    return {k: base64.b64decode(v) for k, v in data.items()}
