"""Support diagnostic bundles (M84, NEX-112): what support needs, with personal data removed, reviewed by an admin.

A bundle is one JSON document: versions, migration heads, the install status (counts only), the agent's settings
without any secret, and recent log lines passed through `scrub`. It is saved as `ready_for_review`; nothing leaves
the install until an admin approves it (V-6) — and sending is a separate step (NEX-113).
"""

import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from nexus.settings import Settings

#: Order matters: the most specific patterns first.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)\b(bearer|basic)\s+\S+"), r"\1 [removed]"),
    (
        re.compile(r"(?i)\b(bearer|token|secret|password|passwd|api[_-]?key|authorization)\b(\s*[:=]\s*|\s+)\S+"),
        r"\1\2[removed]",
    ),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[token removed]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email removed]"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[ip removed]"),
    # Phone-like and long numbers — but not ISO dates and times, which support needs to read logs.
    (re.compile(r"(?<![\w.:-])(?!\d{4}-\d{2}-\d{2})\+?\d[\d ()-]{7,}\d\b"), "[number removed]"),
    (re.compile(r"\b[0-9a-f]{32,}\b", re.IGNORECASE), "[hex removed]"),
]

#: Settings that may appear in a bundle; everything else (URLs with passwords, keys, tokens) never does.
SAFE_SETTINGS = (
    "environment",
    "region",
    "install_mode",
    "install_id",
    "app_version",
    "release_channel",
    "air_gapped",
    "telemetry_enabled",
    "ai_provider",
    "session_idle_minutes",
    "session_absolute_hours",
)

LOG_LINES = 500


def scrub(text: str) -> str:
    """Removes e-mail addresses, tokens and secrets, IP addresses, phone-like and long numbers, long hex ids."""
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def safe_settings(settings: Settings) -> dict[str, Any]:
    return {k: getattr(settings, k) for k in SAFE_SETTINGS}


def recent_log_lines(log_dir: Path | None) -> list[str]:
    if log_dir is None or not log_dir.is_dir():
        return []
    lines: list[str] = []
    for log in sorted(log_dir.glob("*.log"))[-3:]:
        lines += log.read_text(encoding="utf-8", errors="replace").splitlines()[-LOG_LINES:]
    return [scrub(line) for line in lines[-LOG_LINES:]]


def build_bundle(
    settings: Settings, status: dict[str, Any] | None, heads: dict[str, str], log_dir: Path | None, ticket: str | None
) -> tuple[str, bytes]:
    """(bundle id, JSON bytes). The status row holds versions and counts only (V-7)."""
    bundle_id = "dgn-" + datetime.now(UTC).strftime("%Y%m%d%H%M%S") + "-" + secrets.token_hex(3)
    document = {
        "format": "nexus-diagnostics/1",
        "id": bundle_id,
        "createdAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ticketRef": ticket,
        "settings": safe_settings(settings),
        "migrations": heads,
        "installStatus": status,
        "logs": recent_log_lines(log_dir),
    }
    return bundle_id, json.dumps(document, indent=2, default=str).encode()
