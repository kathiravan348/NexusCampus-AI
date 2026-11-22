"""`uv run --project backend nexus-control-release-import <file.release.json>`: verifies a signed release manifest
with OpenBao's `nexus-release` public keys and stores it on the matching Control `releases` row (NEX-117).

Runs with the owner connection (`control_app` is SELECT-only on `releases`). Refuses a bad or unknown signature,
missing row, channel / version / `minUpgradeFrom` mismatch, or a `withdrawn` release.
"""

import argparse
import asyncio
import json
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx2
from pydantic import ValidationError
from sqlalchemy import create_engine, select, update

from nexus.control.releases import releases
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault, Vault
from nexus.releases.manifest import DEFAULT_KEY, SignedRelease, load_public_keys, public_key_file, verify_release
from nexus.settings import get_settings


def import_manifest_with_keys(
    owner_url: str, path: Path, public_keys: Mapping[str, bytes]
) -> tuple[str, SignedRelease]:
    """Verifies `<file.release.json>` against `public_keys` and stores it on the matching `releases` row."""
    raw_text = path.read_text(encoding="utf-8")
    try:
        doc: Any = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"not valid JSON: {exc.msg}") from None
    if not isinstance(doc, dict) or not isinstance(doc.get("manifest"), dict):
        raise ValueError("file is not a signed release manifest object")
    try:
        signed = SignedRelease.model_validate(doc)
    except ValidationError as exc:
        raise ValueError(f"invalid signed release manifest: {exc.errors()[0]['msg']}") from None

    problem = verify_release(signed, public_keys, raw_manifest=doc["manifest"])
    if problem is not None:
        raise ValueError(f"signature verification failed ({problem})")

    m = signed.manifest
    engine = create_engine(owner_url)
    try:
        with engine.begin() as conn:
            row = (
                conn.execute(
                    select(
                        releases.c.id,
                        releases.c.status,
                        releases.c.min_upgrade_from,
                    ).where(releases.c.channel == m.channel, releases.c.version == m.version)
                )
                .mappings()
                .first()
            )
            if row is None:
                raise ValueError(f"no release row matching channel={m.channel} version={m.version}")
            if row["status"] == "withdrawn":
                raise ValueError(f"release {row['id']} is withdrawn")
            if row["min_upgrade_from"] != m.min_upgrade_from:
                raise ValueError(
                    f"minUpgradeFrom mismatch: manifest has {m.min_upgrade_from}, "
                    f"release {row['id']} has {row['min_upgrade_from']}"
                )
            conn.execute(
                update(releases).where(releases.c.id == row["id"]).values(signed_manifest=raw_text, signed=True)
            )
            return str(row["id"]), signed
    finally:
        engine.dispose()


async def import_manifest(
    owner_url: str, path: Path, vault: Vault, key_name: str = DEFAULT_KEY
) -> tuple[str, SignedRelease]:
    keys = load_public_keys(await public_key_file(vault, key_name))
    return import_manifest_with_keys(owner_url, path, keys)


async def _fetch_keys(key_name: str) -> dict[str, bytes]:
    async with httpx2.AsyncClient(timeout=15) as http:
        vault = HttpVault(get_settings(), http)
        return load_public_keys(await public_key_file(vault, key_name))


def main(argv: list[str] | None = None) -> None:
    utf8_console()
    parser = argparse.ArgumentParser(prog="nexus-control-release-import")
    parser.add_argument("file", help="Path to a signed nexuscampus-<version>.release.json file")
    parser.add_argument("--key", default=DEFAULT_KEY, help="OpenBao Transit signing key name (default: nexus-release)")
    args = parser.parse_args(argv)

    try:
        keys = asyncio.run(_fetch_keys(args.key))
        release_id, signed = import_manifest_with_keys(get_control_settings().owner_url(), Path(args.file), keys)
    except (ValueError, OSError, httpx2.HTTPError) as exc:
        print(f"refused: {exc}")
        sys.exit(1)

    m = signed.manifest
    print(f"imported: {release_id} ({m.version} {m.channel}, signed with {m.signing_key_id})")


if __name__ == "__main__":
    main()
