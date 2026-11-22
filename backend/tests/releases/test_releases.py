"""Release manifests and offline bundles (NEX-104): sign → verify, and every way a bundle can be tampered with."""

import io
import tarfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic import ValidationError

from nexus.core.vault import FakeVault
from nexus.releases.bundle import MANIFEST_NAME, build_bundle, describe_files, verify_bundle
from nexus.releases.manifest import (
    ReleaseManifest,
    SignedRelease,
    load_public_keys,
    public_key_file,
    sign_release,
    verify_release,
)

IMAGE = "sha256:" + "ab" * 32


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def manifest(staging: Path | None = None, **over: object) -> ReleaseManifest:
    base: dict[str, object] = {
        "version": "2.5.0",
        "channel": "stable",
        "minUpgradeFrom": "2.3.0",
        "publishedAt": "2026-11-22T00:00:00Z",
        "images": [{"name": "api", "ref": "nexuscampus/api:2.5.0", "imageId": IMAGE}],
        "migrations": {"product": "0016_audit_checkpoints", "control": "c0005_licences"},
        "notesSha256": "0" * 64,
        "files": [f.model_dump(by_alias=True) for f in describe_files(staging)] if staging else [],
        "signingKeyId": "pending",
    }
    base.update(over)
    return ReleaseManifest.model_validate(base)


def staging_dir(tmp: Path) -> Path:
    s = tmp / "staging"
    (s / "images").mkdir(parents=True)
    (s / "images" / "api.tar").write_bytes(b"image layers " * 1000)
    (s / "NOTES.md").write_text("Fixes and improvements.\n", encoding="utf-8")
    return s


async def signed_bundle(tmp: Path) -> tuple[Path, Path, dict[str, bytes], SignedRelease]:
    vault = FakeVault()
    staging = staging_dir(tmp)
    signed = await sign_release(manifest(staging), vault)
    keys = load_public_keys(await public_key_file(vault))
    out = build_bundle(staging, signed, tmp / "nexuscampus-2.5.0.tar")
    return out, staging, keys, signed


def retar(src: Path, dst: Path, change: dict[str, bytes | None], add: list[tarfile.TarInfo] | None = None) -> Path:
    """Copies a bundle, replacing (bytes) or dropping (None) members, optionally adding crafted entries."""
    with tarfile.open(src) as old, tarfile.open(dst, "w", format=tarfile.PAX_FORMAT) as new:
        for m in old.getmembers():
            if m.name in change:
                data = change[m.name]
                if data is None:
                    continue
                info = tarfile.TarInfo(m.name)
                info.size = len(data)
                new.addfile(info, io.BytesIO(data))
            else:
                new.addfile(m, old.extractfile(m))
        for info in add or []:
            new.addfile(info, io.BytesIO(b"x" * info.size) if info.isfile() else None)
    return dst


@pytest.mark.anyio
async def test_sign_verify_and_bundle_round_trip(tmp_path: Path) -> None:
    out, _, keys, signed = await signed_bundle(tmp_path)
    assert signed.manifest.signing_key_id == "nexus-release:v1"
    assert verify_release(signed, keys) is None
    check = verify_bundle(out, keys)
    assert check.valid, check.problems
    assert check.release is not None and {f.path for f in check.release.manifest.files} == {
        "NOTES.md",
        "images/api.tar",
    }


@pytest.mark.anyio
async def test_unknown_key_and_changed_manifest_are_refused(tmp_path: Path) -> None:
    out, _, keys, signed = await signed_bundle(tmp_path)
    other = Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    assert verify_bundle(out, {"nexus-release:v1": other}).problems == ["signature: bad_signature"]
    assert verify_bundle(out, {}).problems == ["signature: unknown_key"]
    newer = signed.model_copy(update={"manifest": signed.manifest.model_copy(update={"min_upgrade_from": "1.0.0"})})
    edited = retar(out, tmp_path / "edited.tar", {MANIFEST_NAME: newer.to_json().encode()})
    assert verify_bundle(edited, keys).problems == ["signature: bad_signature"]


@pytest.mark.anyio
async def test_changed_missing_and_extra_files_are_refused(tmp_path: Path) -> None:
    out, _, keys, _ = await signed_bundle(tmp_path)
    changed = retar(out, tmp_path / "changed.tar", {"images/api.tar": b"evil layers"})
    assert verify_bundle(changed, keys).problems == ["changed file: images/api.tar"]
    missing = retar(out, tmp_path / "missing.tar", {"NOTES.md": None})
    assert verify_bundle(missing, keys).problems == ["missing file: NOTES.md"]
    extra = tarfile.TarInfo("images/extra.tar")
    extra.size = 3
    added = retar(out, tmp_path / "extra.tar", {}, [extra])
    assert verify_bundle(added, keys).problems == ["extra file: images/extra.tar"]


@pytest.mark.anyio
async def test_unsafe_entries_are_refused(tmp_path: Path) -> None:
    out, _, keys, _ = await signed_bundle(tmp_path)
    traversal = tarfile.TarInfo("../outside.txt")
    traversal.size = 1
    absolute = tarfile.TarInfo("/etc/cron.d/x")
    absolute.size = 1
    link = tarfile.TarInfo("images/link")
    link.type, link.linkname = tarfile.SYMTYPE, "/etc/passwd"
    bad = retar(out, tmp_path / "bad.tar", {}, [traversal, absolute, link])
    problems = verify_bundle(bad, keys).problems
    assert "unsafe path: ../outside.txt" in problems
    assert "unsafe path: /etc/cron.d/x" in problems
    assert "not a regular file (link or device): images/link" in problems
    assert not verify_bundle(tmp_path / "staging" / "NOTES.md", keys).valid  # not a tar at all


def test_manifest_rules() -> None:
    with pytest.raises(ValidationError):
        manifest(channel="preview", files=[{"path": "a", "sha256": "0" * 64, "size": 1}])
    with pytest.raises(ValidationError):
        manifest(files=[{"path": "../a", "sha256": "0" * 64, "size": 1}])
    with pytest.raises(ValidationError):
        manifest(images=[])


@pytest.mark.anyio
async def test_a_manifest_signed_before_a_field_was_added_still_verifies(tmp_path: Path) -> None:
    """Signed bytes are what counts: an older manifest without `securityFix` (added later, default false) verifies."""
    import base64
    import json

    from nexus.licensing.canonical import canonical_json

    vault = FakeVault()
    await vault.create_signing_key("nexus-release")
    staging = staging_dir(tmp_path)
    old = manifest(staging, signingKeyId="nexus-release:v1").model_dump(by_alias=True)
    del old["securityFix"]  # as an older release tool wrote it
    token = await vault.sign("nexus-release", b"nexus-release/1\n" + canonical_json(old))
    document = {"format": "nexus-release/1", "manifest": old, "signature": token.split(":", 2)[2]}
    out = tmp_path / "old.tar"
    with tarfile.open(out, "w") as tar:
        data = json.dumps(document).encode()
        info = tarfile.TarInfo(MANIFEST_NAME)
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
        for f in old["files"]:
            tar.add(staging / f["path"], arcname=f["path"])
    keys = load_public_keys(await public_key_file(vault))
    check = verify_bundle(out, keys)
    assert check.valid, check.problems
    assert check.release is not None and check.release.manifest.security_fix is False
    assert base64.b64decode(str(document["signature"]))  # a real signature, not a placeholder
