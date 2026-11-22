"""The install's licence summary (M84 `LicenceSummary`): verified offline with pinned public keys (D23).

Expiry moves a licence to grace and then read-only — never data loss. A missing, unreadable or tampered licence file
is shown as `read_only` with the reason; nothing is deleted and data stays readable.
"""

import base64
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal

from pydantic import ValidationError

from nexus.licensing.licence import LicenceFile, verify_licence

LICENCE_FILE = "licence.json"
LICENCE_KEYS = "licence-keys.json"

Problem = Literal["missing", "unreadable", "unknown_key", "bad_signature"]


@dataclass(frozen=True)
class LicenceCheckResult:
    summary: dict[str, Any] | None
    problem: Problem | None
    file: LicenceFile | None


def load_keys(path: Path) -> dict[str, bytes]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(k): base64.b64decode(str(v)) for k, v in data.items()}


def check_licence(install_dir: Path, today: date, learners: int, campuses: int) -> LicenceCheckResult:
    """The `LicenceSummary` (camelCase) for the M84 screen, or a read-only fallback with the problem."""
    path, keys_path = install_dir / LICENCE_FILE, install_dir / LICENCE_KEYS
    if not path.exists() or not keys_path.exists():
        return LicenceCheckResult(None, "missing", None)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        file = LicenceFile.model_validate(document)
        keys = load_keys(keys_path)
    except (ValidationError, ValueError, OSError):
        return LicenceCheckResult(None, "unreadable", None)
    check = verify_licence(file, keys, today, document["payload"])
    if not check.valid or check.state is None:
        return LicenceCheckResult(None, check.problem, file)
    terms = file.payload
    summary = {
        "edition": terms.edition,
        "state": check.state,
        "expiresAt": terms.expires_at,
        "supportEndsAt": terms.support_ends_at,
        "learnerCap": terms.learner_cap,
        "learnersUsed": learners,
        "campusCap": terms.campus_cap,
        "campusesUsed": campuses,
        "graceEndsAt": check.grace_ends_on.isoformat() if check.grace_ends_on else None,
    }
    return LicenceCheckResult(summary, None, file)


def read_only_summary(learners: int, campuses: int, today: date) -> dict[str, Any]:
    """What the screen shows when the licence cannot be verified: read-only, data kept (D23)."""
    return {
        "edition": "standard",
        "state": "read_only",
        "expiresAt": None,
        "supportEndsAt": today.isoformat(),
        "learnerCap": max(1, learners),
        "learnersUsed": learners,
        "campusCap": max(1, campuses),
        "campusesUsed": campuses,
        "graceEndsAt": None,
    }
