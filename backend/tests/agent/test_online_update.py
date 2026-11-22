"""Unit tests for M84 signed online update checks (NEX-117) and offline-beats-online precedence in `run_once`."""

import asyncio
import json
from datetime import date
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from nexus.agent.online import OnlineCheckResult, check_online
from nexus.agent.state import run_once
from nexus.agent.updates import INBOX, RELEASE_KEYS
from nexus.core.vault import FakeVault
from nexus.releases.bundle import build_bundle, describe_files
from nexus.releases.manifest import (
    ReleaseManifest,
    SignedRelease,
    load_public_keys,
    public_key_file,
    sign_release,
)
from nexus.settings import Settings


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def _sign_manifest(
    vault: FakeVault,
    *,
    version: str = "2.4.1",
    channel: str = "stable",
    min_upgrade_from: str = "2.2.0",
    published_at: str = "2026-09-01T10:00:00Z",
    security_fix: bool = True,
) -> tuple[SignedRelease, dict[str, bytes]]:
    manifest = ReleaseManifest.model_validate(
        {
            "version": version,
            "channel": channel,
            "minUpgradeFrom": min_upgrade_from,
            "publishedAt": published_at,
            "images": [{"name": "api", "ref": f"nexuscampus/api:{version}", "imageId": "sha256:" + "a" * 64}],
            "migrations": {"product": "0019_install_active_users"},
            "notesSha256": "b" * 64,
            "securityFix": security_fix,
            "files": [],
            "signingKeyId": "pending",
        }
    )
    signed = await sign_release(manifest, vault)
    keys = load_public_keys(await public_key_file(vault))
    return signed, keys


def _release_meta(
    *,
    version: str = "2.4.1",
    channel: str = "stable",
    min_upgrade_from: str = "2.2.0",
    notes: str = "Fixes Tamil fallback.",
) -> dict[str, Any]:
    return {
        "id": "rel-241",
        "version": version,
        "channel": channel,
        "status": "published",
        "publishedAt": "2026-09-01T10:00:00Z",
        "signed": True,
        "offlineBundle": True,
        "minUpgradeFrom": min_upgrade_from,
        "migrationNotes": notes,
        "notesAiDrafted": False,
    }


def _settings(tmp_path: Path, **over: Any) -> Settings:
    defaults: dict[str, Any] = {
        "install_mode": "self_hosted",
        "install_dir": tmp_path,
        "app_version": "2.4.0",
        "air_gapped": False,
        "telemetry_enabled": True,
        "control_url": "https://control.nexuscampus.example?secret=drop-me",
        "control_agent_token": SecretStr("agt-online-secret-token-42"),
    }
    defaults.update(over)
    return Settings(**defaults)


@pytest.mark.anyio
async def test_valid_signed_online_offer_verifies_and_strips_query_without_leaking_token(tmp_path: Path) -> None:
    vault = FakeVault()
    signed, keys = await _sign_manifest(vault, version="2.4.1", security_fix=True)
    captured: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured.append(request)
        return httpx2.Response(
            200,
            json={"release": _release_meta(notes="N" * 6000), "manifest": json.loads(signed.to_json())},
            request=request,
        )

    res = check_online(
        _settings(tmp_path),
        keys,
        current="2.4.0",
        support_ends=date(2026, 12, 31),
        transport=httpx2.MockTransport(handler),
    )
    assert res.checked is True and res.offer is not None
    assert len(captured) == 1
    assert str(captured[0].url) == "https://control.nexuscampus.example/control/api/v1/agent/update"
    assert captured[0].headers["authorization"] == "Bearer agt-online-secret-token-42"
    assert res.offer == {
        "version": "2.4.1",
        "channel": "stable",
        "source": "online",
        "signatureValid": True,
        "securityFix": True,
        "releaseNotes": "N" * 5000,
        "coveredBySupport": True,
    }
    assert "agt-online-secret-token-42" not in res.message
    assert "drop-me" not in res.message


@pytest.mark.anyio
async def test_rejects_bad_signature_mismatch_older_version_min_upgrade_and_redirect(tmp_path: Path) -> None:
    vault = FakeVault()
    signed, keys = await _sign_manifest(vault, version="2.4.1", channel="stable", min_upgrade_from="2.2.0")
    doc = json.loads(signed.to_json())

    # 1. Tampered manifest (bad signature)
    tampered = json.loads(signed.to_json())
    tampered["manifest"]["securityFix"] = False
    r_bad = check_online(
        _settings(tmp_path),
        keys,
        "2.4.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(
            lambda req: httpx2.Response(200, json={"release": _release_meta(), "manifest": tampered}, request=req)
        ),
    )
    assert r_bad.checked is True and r_bad.offer is None and "bad_signature" in r_bad.message

    # 2. Manifest does not match release metadata
    r_mismatch = check_online(
        _settings(tmp_path),
        keys,
        "2.4.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(
            lambda req: httpx2.Response(
                200, json={"release": _release_meta(version="2.4.2"), "manifest": doc}, request=req
            )
        ),
    )
    assert r_mismatch.checked is True and r_mismatch.offer is None and "does not match" in r_mismatch.message

    # 3. Older / equal version rejected
    r_old = check_online(
        _settings(tmp_path),
        keys,
        "2.4.1",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(
            lambda req: httpx2.Response(200, json={"release": _release_meta(), "manifest": doc}, request=req)
        ),
    )
    assert r_old.checked is True and r_old.offer is None and "not newer" in r_old.message

    # 4. Current version older than minUpgradeFrom rejected
    r_min = check_online(
        _settings(tmp_path),
        keys,
        "2.1.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(
            lambda req: httpx2.Response(200, json={"release": _release_meta(), "manifest": doc}, request=req)
        ),
    )
    assert r_min.checked is True and r_min.offer is None and "needs 2.2.0" in r_min.message

    # 5. Redirect (302) is NOT followed
    r_redir = check_online(
        _settings(tmp_path),
        keys,
        "2.4.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(
            lambda req: httpx2.Response(302, headers={"Location": "https://evil.example/"}, request=req)
        ),
    )
    assert r_redir.checked is False and r_redir.offer is None and "302" in r_redir.message


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"air_gapped": True}, "air-gapped"),
        ({"telemetry_enabled": False}, "telemetry"),
        ({"control_agent_token": SecretStr("")}, "token"),
        ({"control_url": "http://control.nexuscampus.example"}, "https required"),
    ],
)
def test_no_network_call_when_skipped_or_plain_http_to_remote_host(
    tmp_path: Path, overrides: dict[str, Any], expected: str
) -> None:
    def forbid(request: httpx2.Request) -> httpx2.Response:
        raise AssertionError(f"Network request must not be made: {request.url}")

    res = check_online(
        _settings(tmp_path, **overrides),
        {"nexus-release:v1": b"k" * 32},
        "2.4.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(forbid),
    )
    assert res.checked is False and res.offer is None
    assert expected in res.message
    assert "agt-online-secret-token-42" not in res.message


@pytest.mark.parametrize(("outcome", "expected"), [(401, "401"), (403, "403"), (429, "429"), ("timeout", "timed out")])
def test_http_errors_and_timeout_never_raise_or_leak_token(tmp_path: Path, outcome: int | str, expected: str) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        if outcome == "timeout":
            raise httpx2.ReadTimeout("slow", request=request)
        return httpx2.Response(int(outcome), request=request)

    res = check_online(
        _settings(tmp_path),
        {"nexus-release:v1": b"k" * 32},
        "2.4.0",
        date(2026, 12, 31),
        transport=httpx2.MockTransport(handler),
    )
    assert res.checked is False and res.offer is None
    assert "\n" not in res.message and expected in res.message
    assert "agt-online-secret-token-42" not in res.message


class _StubConn:
    """Minimal DB stub for `run_once` capturing the `install_status` write parameters."""

    def __init__(self) -> None:
        self.saved: dict[str, Any] = {}

    def execute(self, stmt: Any, params: dict[str, Any] | None = None) -> Any:
        sql = str(stmt)
        if "nexus_audit_tenants" in sql:
            return type("R", (), {"scalars": lambda self: []})()
        if "INSERT INTO install_status" in sql and params is not None:
            self.saved = dict(params)
            return None
        raise AssertionError(f"Unexpected SQL: {sql}")


def test_offline_bundle_beats_online_and_last_update_check_set_only_after_call(tmp_path: Path) -> None:
    vault = FakeVault()
    # 1. Online offer accepted when inbox is empty, and `last_update_check_at` set only when `online.checked=True`.
    online_offer = {
        "version": "2.4.1",
        "channel": "stable",
        "source": "online",
        "signatureValid": True,
        "securityFix": True,
        "releaseNotes": "Online notes",
        "coveredBySupport": True,
    }
    cfg = _settings(tmp_path, app_version="2.4.0")

    conn_skip = _StubConn()
    run_once(conn_skip, cfg, today=date(2026, 11, 22), online=OnlineCheckResult(False, None, "skipped"))  # type: ignore[arg-type]
    assert conn_skip.saved["update_check"] is None and conn_skip.saved["offer"] is None

    conn_online = _StubConn()
    r_on = run_once(
        conn_online,  # type: ignore[arg-type]
        cfg,
        today=date(2026, 11, 22),
        online=OnlineCheckResult(True, online_offer, "update 2.4.1 verified (online)"),
    )
    assert conn_online.saved["update_check"] is not None
    assert conn_online.saved["offer"]["source"] == "online" and r_on.offer_version == "2.4.1"

    # 2. Verified offline bundle in `inbox/` wins over the online offer.
    staging = tmp_path / "staging"
    (staging / "images").mkdir(parents=True)
    (staging / "images" / "api.tar").write_bytes(b"img" * 20)
    (staging / "NOTES.md").write_text("Offline 2.5.0", encoding="utf-8")
    manifest = ReleaseManifest.model_validate(
        {
            "version": "2.5.0",
            "channel": "stable",
            "minUpgradeFrom": "2.4.0",
            "publishedAt": "2026-11-20T00:00:00Z",
            "images": [{"name": "api", "ref": "nexuscampus/api:2.5.0", "imageId": "sha256:" + "a" * 64}],
            "migrations": {"product": "0019_install_active_users"},
            "notesSha256": "0" * 64,
            "files": [f.model_dump(by_alias=True) for f in describe_files(staging)],
            "signingKeyId": "pending",
        }
    )
    signed = asyncio.run(sign_release(manifest, vault))
    (tmp_path / RELEASE_KEYS).write_text(json.dumps(asyncio.run(public_key_file(vault))), encoding="utf-8")
    (tmp_path / INBOX).mkdir(exist_ok=True)
    build_bundle(staging, signed, tmp_path / INBOX / "nexuscampus-2.5.0.tar")

    conn_both = _StubConn()
    r_both = run_once(
        conn_both,  # type: ignore[arg-type]
        cfg,
        today=date(2026, 11, 22),
        online=OnlineCheckResult(True, online_offer, "update 2.4.1 verified (online)"),
    )
    assert conn_both.saved["offer"]["source"] == "offline_bundle"
    assert r_both.offer_version == "2.5.0"

    # 3. Air-gapped install never sets `update_check` or uses an online offer.
    conn_air = _StubConn()
    run_once(
        conn_air,  # type: ignore[arg-type]
        _settings(tmp_path, air_gapped=True),
        today=date(2026, 11, 22),
        online=OnlineCheckResult(True, online_offer, "ignored"),
    )
    assert conn_air.saved["update_check"] is None
    assert conn_air.saved["offer"]["source"] == "offline_bundle"
