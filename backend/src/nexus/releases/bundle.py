"""Offline update bundles (DM-9, NEX-104): one `.tar` with `release.json` (the signed manifest) and every file it lists.

`verify_bundle` reads the tar without extracting anything: it refuses links, devices, absolute paths and `..`,
checks the signature against pinned public keys, and hashes every member while streaming it. Any missing, extra or
changed file — or a changed manifest — makes the bundle invalid, with the reasons listed.
"""

import hashlib
import io
import tarfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import ValidationError

from nexus.releases.manifest import BundleFile, SignedRelease, safe_path, verify_release

MANIFEST_NAME = "release.json"
_CHUNK = 1024 * 1024


def hash_stream(stream: io.BufferedIOBase | io.RawIOBase | io.BytesIO | object) -> tuple[str, int]:
    digest, size = hashlib.sha256(), 0
    read = getattr(stream, "read")  # noqa: B009 — tarfile.ExFileObject and real files both have read()
    while chunk := read(_CHUNK):
        digest.update(chunk)
        size += len(chunk)
    return digest.hexdigest(), size


def describe_files(staging: Path) -> list[BundleFile]:
    """Every regular file under `staging` (except the manifest), sorted, with SHA-256 and size."""
    files: list[BundleFile] = []
    for path in sorted(p for p in staging.rglob("*") if p.is_file()):
        rel = path.relative_to(staging).as_posix()
        if rel == MANIFEST_NAME:
            continue
        with path.open("rb") as f:
            sha, size = hash_stream(f)
        files.append(BundleFile(path=rel, sha256=sha, size=size))
    return files


def _info(name: str, size: int) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.size, info.mode, info.mtime, info.uid, info.gid = size, 0o644, 0, 0, 0
    info.uname = info.gname = ""
    return info


def build_bundle(staging: Path, signed: SignedRelease, out: Path) -> Path:
    """Writes `release.json` first, then the files in manifest order (reproducible: fixed times and owners)."""
    data = signed.to_json().encode()
    with tarfile.open(out, "w", format=tarfile.PAX_FORMAT) as tar:
        tar.addfile(_info(MANIFEST_NAME, len(data)), io.BytesIO(data))
        for f in signed.manifest.files:
            src = staging / f.path
            with src.open("rb") as stream:
                tar.addfile(_info(f.path, src.stat().st_size), stream)
    return out


@dataclass
class BundleCheck:
    problems: list[str] = field(default_factory=list)
    release: SignedRelease | None = None

    @property
    def valid(self) -> bool:
        return not self.problems and self.release is not None


def verify_bundle(path: Path, public_keys: Mapping[str, bytes]) -> BundleCheck:
    check = BundleCheck()
    try:
        tar = tarfile.open(path, "r:*")  # noqa: SIM115 — closed below
    except (tarfile.TarError, OSError) as exc:
        check.problems.append(f"not a readable bundle: {exc.__class__.__name__}")
        return check
    with tar:
        members = tar.getmembers()
        regular: dict[str, tarfile.TarInfo] = {}
        for m in members:
            if m.isdir():
                continue
            if not m.isfile():
                check.problems.append(f"not a regular file (link or device): {m.name}")
            elif not safe_path(m.name):
                check.problems.append(f"unsafe path: {m.name}")
            elif m.name in regular:
                check.problems.append(f"duplicate entry: {m.name}")
            else:
                regular[m.name] = m
        if MANIFEST_NAME not in regular:
            check.problems.append(f"{MANIFEST_NAME} missing")
            return check
        raw = tar.extractfile(regular[MANIFEST_NAME])
        assert raw is not None
        try:
            release = SignedRelease.model_validate_json(raw.read())
        except ValidationError:
            check.problems.append(f"{MANIFEST_NAME} is not a valid signed release")
            return check
        problem = verify_release(release, public_keys)
        if problem:
            check.problems.append(f"signature: {problem}")
            return check  # nothing in an unsigned manifest can be trusted
        check.release = release
        listed = {f.path: f for f in release.manifest.files}
        for name in sorted(set(regular) - set(listed) - {MANIFEST_NAME}):
            check.problems.append(f"extra file: {name}")
        for name, expected in listed.items():
            member = regular.get(name)
            if member is None:
                check.problems.append(f"missing file: {name}")
                continue
            stream = tar.extractfile(member)
            assert stream is not None
            sha, size = hash_stream(stream)
            if (sha, size) != (expected.sha256, expected.size):
                check.problems.append(f"changed file: {name}")
    return check
