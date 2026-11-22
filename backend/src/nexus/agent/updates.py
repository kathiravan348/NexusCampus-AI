"""Finding an update (M84 `UpdateOffer`, NEX-105): offline bundles dropped into the install's `inbox/`.

Only a bundle that verifies completely (signature with the pinned release keys, every file, no unsafe entries) can be
offered; of those, the newest that is newer than the running version and allows an upgrade straight from it.
"""

import re
import tarfile
from datetime import date
from pathlib import Path
from typing import Any

from nexus.releases.bundle import verify_bundle
from nexus.releases.manifest import SignedRelease

INBOX = "inbox"
RELEASE_KEYS = "release-keys.json"
NOTES_FILE = "NOTES.md"
NOTES_MAX = 5000


def version_key(version: str) -> tuple[tuple[int, int, int], int, str]:
    """Semver order: 2.5.0-rc.1 < 2.5.0 < 2.5.1."""
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-(.+))?", version)
    if not m:
        raise ValueError(f"not a version: {version}")
    major, minor, patch, pre = m.groups()
    return (int(major), int(minor), int(patch)), (0 if pre else 1), pre or ""


def _notes(bundle: Path) -> str:
    """The verified bundle's release notes (already hash-checked by `verify_bundle`)."""
    with tarfile.open(bundle) as tar:
        try:
            member = tar.getmember(NOTES_FILE)
        except KeyError:
            return ""
        stream = tar.extractfile(member)
        return (stream.read(NOTES_MAX * 4).decode("utf-8", errors="replace") if stream else "")[:NOTES_MAX]


def find_offer(
    install_dir: Path, keys: dict[str, bytes], current: str, support_ends: date | None
) -> tuple[dict[str, Any] | None, list[str]]:
    """The `UpdateOffer` (camelCase) and the reasons each other bundle was not offered."""
    inbox = install_dir / INBOX
    skipped: list[str] = []
    best: tuple[SignedRelease, Path] | None = None
    for bundle in sorted(inbox.glob("*.tar")) if inbox.is_dir() else []:
        check = verify_bundle(bundle, keys)
        if not check.valid or check.release is None:
            skipped.append(f"{bundle.name}: {'; '.join(check.problems)}")
            continue
        m = check.release.manifest
        if version_key(m.version) <= version_key(current):
            skipped.append(f"{bundle.name}: {m.version} is not newer than {current}")
            continue
        if version_key(current) < version_key(m.min_upgrade_from):
            skipped.append(f"{bundle.name}: needs {m.min_upgrade_from} or later first")
            continue
        if best is None or version_key(m.version) > version_key(best[0].manifest.version):
            best = (check.release, bundle)
    if best is None:
        return None, skipped
    release, path = best
    m = release.manifest
    released = date.fromisoformat(m.published_at[:10])
    offer = {
        "version": m.version,
        "channel": m.channel,
        "source": "offline_bundle",
        "signatureValid": True,
        "securityFix": m.security_fix,
        "releaseNotes": _notes(path),
        "coveredBySupport": support_ends is not None and support_ends >= released,
    }
    return offer, skipped
