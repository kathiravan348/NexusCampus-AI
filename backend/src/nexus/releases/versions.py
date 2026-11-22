"""Semantic-version order shared by the install agent (NEX-105) and Nexus Control's update check (NEX-115)."""

import re

#: One pre-release identifier: numeric ones sort before alphanumeric ones, numbers compare as numbers (semver 2.0).
PreIdentifier = tuple[int, int, str]
VersionKey = tuple[tuple[int, int, int], int, tuple[PreIdentifier, ...]]


def version_key(version: str) -> VersionKey:
    """Semver order: 2.5.0-rc.1 < 2.5.0-rc.2 < 2.5.0-rc.10 < 2.5.0 < 2.5.1."""
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?", version)
    if not m:
        raise ValueError(f"not a version: {version}")
    major, minor, patch, pre = m.groups()
    identifiers = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in pre.split(".")) if pre else ()
    return (int(major), int(minor), int(patch)), (0 if pre else 1), identifiers
