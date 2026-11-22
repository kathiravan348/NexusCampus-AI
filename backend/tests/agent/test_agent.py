"""Install agent core (NEX-105): offline licence summary and which update bundle may be offered."""

import json
import tarfile
from datetime import date
from pathlib import Path

import pytest

from nexus.agent.licence import LICENCE_FILE, LICENCE_KEYS, check_licence
from nexus.agent.updates import INBOX, find_offer
from nexus.core.vault import FakeVault
from nexus.licensing.licence import LicenceTerms, issue_licence
from nexus.releases.bundle import build_bundle, describe_files
from nexus.releases.manifest import ReleaseManifest, load_public_keys, public_key_file, sign_release
from nexus.releases.versions import version_key


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def write_licence(install: Path, vault: FakeVault, **over: object) -> None:
    terms = {
        "id": "lic-ax",
        "accountId": "acc-ax",
        "edition": "standard",
        "modules": ["M01", "M84"],
        "learnerCap": 1500,
        "campusCap": 5,
        "issuedAt": "2026-01-01T00:00:00Z",
        "expiresAt": "2026-12-31",
        "supportEndsAt": "2026-12-31",
        "graceDays": 30,
        "activation": "offline",
        "signingKeyId": "pending",
        **over,
    }
    file = await issue_licence(LicenceTerms.model_validate(terms), vault, "nexus-licence")
    (install / LICENCE_FILE).write_text(file.to_json(), encoding="utf-8")
    (install / LICENCE_KEYS).write_text(json.dumps(await public_key_file(vault, "nexus-licence")), encoding="utf-8")


@pytest.mark.anyio
async def test_licence_states_and_counts(tmp_path: Path) -> None:
    vault = FakeVault()
    await write_licence(tmp_path, vault)
    active = check_licence(tmp_path, date(2026, 11, 22), learners=1284, campuses=3)
    assert active.problem is None and active.summary is not None
    assert (active.summary["state"], active.summary["learnersUsed"], active.summary["campusesUsed"]) == (
        "active",
        1284,
        3,
    )
    grace = check_licence(tmp_path, date(2027, 1, 10), 1, 1).summary
    assert grace is not None and (grace["state"], grace["graceEndsAt"]) == ("grace", "2027-01-30")
    later = check_licence(tmp_path, date(2027, 3, 1), 1, 1).summary
    assert later is not None and later["state"] == "read_only"


@pytest.mark.anyio
async def test_missing_unreadable_and_tampered_licences(tmp_path: Path) -> None:
    assert check_licence(tmp_path, date(2026, 11, 22), 0, 0).problem == "missing"
    vault = FakeVault()
    await write_licence(tmp_path, vault)
    data = json.loads((tmp_path / LICENCE_FILE).read_text(encoding="utf-8"))
    data["payload"]["learnerCap"] = 99999
    (tmp_path / LICENCE_FILE).write_text(json.dumps(data), encoding="utf-8")
    assert check_licence(tmp_path, date(2026, 11, 22), 0, 0).problem == "bad_signature"
    (tmp_path / LICENCE_FILE).write_text("{not json", encoding="utf-8")
    assert check_licence(tmp_path, date(2026, 11, 22), 0, 0).problem == "unreadable"


async def bundle(tmp: Path, vault: FakeVault, version: str, min_from: str = "2.3.0", **over: object) -> Path:
    staging = tmp / f"staging-{version}"
    (staging / "images").mkdir(parents=True)
    (staging / "images" / "api.tar").write_bytes(version.encode() * 100)
    (staging / "NOTES.md").write_text(f"NexusCampus {version}: fixes.", encoding="utf-8")
    manifest = ReleaseManifest.model_validate(
        {
            "version": version,
            "channel": "stable",
            "minUpgradeFrom": min_from,
            "publishedAt": "2026-11-20T00:00:00Z",
            "images": [{"name": "api", "ref": f"nexuscampus/api:{version}", "imageId": "sha256:" + "a" * 64}],
            "migrations": {"product": "0017_install_status"},
            "notesSha256": "0" * 64,
            "files": [f.model_dump(by_alias=True) for f in describe_files(staging)],
            "signingKeyId": "pending",
            **over,
        }
    )
    signed = await sign_release(manifest, vault)
    (tmp / INBOX).mkdir(exist_ok=True)
    return build_bundle(staging, signed, tmp / INBOX / f"nexuscampus-{version}.tar")


@pytest.mark.anyio
async def test_offer_is_the_newest_valid_upgradable_bundle(tmp_path: Path) -> None:
    vault = FakeVault()
    await bundle(tmp_path, vault, "2.4.0")  # older than the running 2.4.1
    await bundle(tmp_path, vault, "2.5.0", securityFix=True)
    await bundle(tmp_path, vault, "2.6.0", min_from="2.5.0")  # cannot upgrade straight from 2.4.1
    tampered = await bundle(tmp_path, vault, "2.7.0")
    with tarfile.open(tampered) as tar:  # flip a byte inside the bundled image itself
        offset = tar.getmember("images/api.tar").offset_data
    raw = bytearray(tampered.read_bytes())
    raw[offset + 10] ^= 0xFF
    tampered.write_bytes(bytes(raw))
    keys = load_public_keys(await public_key_file(vault))
    offer, skipped = find_offer(tmp_path, keys, "2.4.1", support_ends=date(2026, 12, 31))
    assert offer == {
        "version": "2.5.0",
        "channel": "stable",
        "source": "offline_bundle",
        "signatureValid": True,
        "securityFix": True,
        "releaseNotes": "NexusCampus 2.5.0: fixes.",
        "coveredBySupport": True,
    }
    reasons = " | ".join(skipped)
    assert "not newer" in reasons and "needs 2.5.0" in reasons and "changed file" in reasons
    none, _ = find_offer(tmp_path, keys, "2.6.0", support_ends=date(2026, 1, 1))  # 2.7.0 is tampered
    assert none is None
    uncovered, _ = find_offer(tmp_path, keys, "2.4.1", support_ends=date(2026, 11, 1))
    assert uncovered is not None and uncovered["coveredBySupport"] is False


def test_version_order() -> None:
    assert version_key("2.5.0-rc.1") < version_key("2.5.0") < version_key("2.5.1") < version_key("2.10.0")
    assert version_key("2.5.0-rc.2") < version_key("2.5.0-rc.10") < version_key("2.5.0-rc.a")
