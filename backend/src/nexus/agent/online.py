"""Online update check for M84 (NEX-117): asks Control `GET /agent/update` and verifies the signed manifest offline.

Only accepts an update after verifying `nexus-release/1` with the install's pinned `release-keys.json` and checking
that the manifest matches the release metadata and upgrade path. Never calls Control when air-gapped, telemetry is
off, or no agent token is configured. Never prints or leaks the bearer token or URL query strings.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx2
from pydantic import ValidationError

from nexus.agent.health import control_endpoint, report_skip_reason
from nexus.agent.updates import NOTES_MAX
from nexus.releases.manifest import SignedRelease, verify_release
from nexus.releases.versions import version_key
from nexus.settings import Settings

UPDATE_ENDPOINT_PATH = "/control/api/v1/agent/update"
UPDATE_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class OnlineCheckResult:
    #: True only after a real HTTP 200 answer from Control (drives `install_status.last_update_check_at`).
    checked: bool
    offer: dict[str, Any] | None
    message: str


def _verify_offer(
    body: Any,
    keys: Mapping[str, bytes],
    current: str,
    support_ends: date | None,
) -> OnlineCheckResult:
    if not isinstance(body, dict):
        return OnlineCheckResult(checked=False, offer=None, message="failed: control answered with invalid JSON")
    release = body.get("release")
    if release is None:
        return OnlineCheckResult(checked=True, offer=None, message="no online update available")
    if not isinstance(release, dict):
        return OnlineCheckResult(checked=False, offer=None, message="failed: invalid release object from control")

    manifest_doc = body.get("manifest")
    if not isinstance(manifest_doc, dict) or not isinstance(manifest_doc.get("manifest"), dict):
        return OnlineCheckResult(checked=True, offer=None, message="refused: release has no signed manifest")

    try:
        signed = SignedRelease.model_validate(manifest_doc)
    except ValidationError:
        return OnlineCheckResult(checked=True, offer=None, message="refused: invalid signed release manifest")

    problem = verify_release(signed, keys, raw_manifest=manifest_doc["manifest"])
    if problem is not None:
        return OnlineCheckResult(checked=True, offer=None, message=f"refused: signature check failed ({problem})")

    m = signed.manifest
    if (
        m.version != release.get("version")
        or m.channel != release.get("channel")
        or m.min_upgrade_from != release.get("minUpgradeFrom")
    ):
        return OnlineCheckResult(
            checked=True, offer=None, message="refused: signed manifest does not match release metadata"
        )

    try:
        cur_key = version_key(current)
        new_key = version_key(m.version)
        min_key = version_key(m.min_upgrade_from)
    except ValueError:
        return OnlineCheckResult(checked=True, offer=None, message="refused: invalid release version")

    if new_key[1] == 0 and m.channel != "preview":
        return OnlineCheckResult(checked=True, offer=None, message="refused: pre-release offered outside preview")
    if new_key <= cur_key:
        return OnlineCheckResult(checked=True, offer=None, message=f"refused: {m.version} is not newer than {current}")
    if cur_key < min_key:
        return OnlineCheckResult(
            checked=True, offer=None, message=f"refused: {m.version} needs {m.min_upgrade_from} or later"
        )

    released = date.fromisoformat(m.published_at[:10])
    notes = str(release.get("migrationNotes") or "")[:NOTES_MAX]
    offer: dict[str, Any] = {
        "version": m.version,
        "channel": m.channel,
        "source": "online",
        "signatureValid": True,
        "securityFix": m.security_fix,
        "releaseNotes": notes,
        "coveredBySupport": support_ends is not None and support_ends >= released,
    }
    return OnlineCheckResult(checked=True, offer=offer, message=f"update {m.version} verified (online)")


def check_online(
    settings: Settings,
    keys: Mapping[str, bytes],
    current: str,
    support_ends: date | None,
    transport: httpx2.BaseTransport | None = None,
) -> OnlineCheckResult:
    """Checks Control for an update and verifies the signed manifest with `keys`. Never raises."""
    skip = report_skip_reason(settings)
    if skip is not None:
        return OnlineCheckResult(checked=False, offer=None, message=skip)
    endpoint = control_endpoint(settings.control_url, UPDATE_ENDPOINT_PATH)
    if endpoint is None:
        return OnlineCheckResult(
            checked=False,
            offer=None,
            message="failed: invalid control URL (https required, http only on this machine)",
        )
    if not keys:
        return OnlineCheckResult(checked=False, offer=None, message="skipped: no pinned release keys")

    token = settings.control_agent_token.get_secret_value().strip()
    client = (
        httpx2.Client(timeout=UPDATE_TIMEOUT_SECONDS, verify=True, follow_redirects=False, transport=transport)
        if transport is not None
        else httpx2.Client(timeout=UPDATE_TIMEOUT_SECONDS, verify=True, follow_redirects=False)
    )
    try:
        with client:
            response = client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
    except httpx2.TimeoutException:
        return OnlineCheckResult(checked=False, offer=None, message="failed: control timed out")
    except httpx2.ConnectError:
        return OnlineCheckResult(checked=False, offer=None, message="failed: could not reach control")
    except httpx2.HTTPError as exc:
        return OnlineCheckResult(checked=False, offer=None, message=f"failed: network error ({type(exc).__name__})")

    status = response.status_code
    if status == 401:
        return OnlineCheckResult(checked=False, offer=None, message="rejected (401): agent token invalid or revoked")
    if status == 403:
        return OnlineCheckResult(checked=False, offer=None, message="rejected (403): deployment is air-gapped")
    if status == 429:
        return OnlineCheckResult(checked=False, offer=None, message="rate limited (429): wait 60s before next check")
    if status != 200:
        return OnlineCheckResult(checked=False, offer=None, message=f"failed: control answered HTTP {status}")

    try:
        body = response.json()
    except ValueError:
        return OnlineCheckResult(checked=False, offer=None, message="failed: control answered with invalid JSON")
    return _verify_offer(body, keys, current, support_ends)
