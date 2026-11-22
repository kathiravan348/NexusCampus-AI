"""Release tools (NEX-104).

`uv run --project backend nexus-release-bundle --version 2.5.0 --channel stable --min-upgrade-from 2.3.0
  --notes NOTES.md --image api=nexuscampus/api:2.5.0 [--image …] --out dist [--online-only] [--keys dist/keys.json]`
  saves each image (`docker save`), writes the manifest (image content ids, migration heads, notes hash, every file's
  SHA-256), signs it in OpenBao (`NEXUS_VAULT_*`; key `nexus-release`, never exported) and writes
  `nexuscampus-<version>.release.json` (+ `nexuscampus-<version>.tar` unless `--online-only`). `--keys` writes the
  public keys file installs pin.

`uv run --project backend nexus-release-verify <bundle.tar> --keys keys.json` checks a bundle offline (exit 1 on any
problem, with the reasons).
"""

import argparse
import asyncio
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import httpx2
from alembic.config import Config
from alembic.script import ScriptDirectory

from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.releases.bundle import build_bundle, describe_files, verify_bundle
from nexus.releases.manifest import (
    ReleaseManifest,
    SignedRelease,
    load_public_keys,
    public_key_file,
    sign_release,
)
from nexus.settings import BACKEND_ROOT, get_settings


def _heads() -> dict[str, str]:
    out: dict[str, str] = {}
    for name, ini in (("product", "alembic.ini"), ("control", "control_alembic.ini")):
        script = ScriptDirectory.from_config(Config(str(Path(BACKEND_ROOT) / ini)))
        heads = script.get_heads()
        if len(heads) != 1:
            sys.exit(f"{name} migrations must have exactly one head, found {heads}")
        out[name] = heads[0]
    return out


def _docker(*args: str) -> str:
    done = subprocess.run(["docker", *args], capture_output=True, text=True, check=False)
    if done.returncode != 0:
        sys.exit(f"docker {' '.join(args)} failed: {done.stderr.strip()[:300]}")
    return done.stdout.strip()


async def _sign(manifest: ReleaseManifest, key: str) -> tuple[SignedRelease, dict[str, str]]:
    async with httpx2.AsyncClient(timeout=30) as http:
        vault = HttpVault(get_settings(), http)
        return await sign_release(manifest, vault, key), await public_key_file(vault, key)


def bundle(args: argparse.Namespace) -> None:
    images = []
    for spec in args.image:
        name, _, ref = spec.partition("=")
        if not ref:
            sys.exit(f"--image needs name=ref, got {spec!r}")
        images.append({"name": name, "ref": ref, "imageId": _docker("image", "inspect", "--format", "{{.Id}}", ref)})
    notes = Path(args.notes).read_bytes()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nexus-release-") as tmp:
        staging = Path(tmp)
        files = []
        if not args.online_only:
            (staging / "images").mkdir()
            for image in images:
                _docker("save", "-o", str(staging / "images" / f"{image['name']}.tar"), str(image["ref"]))
            shutil.copyfile(args.notes, staging / "NOTES.md")
            files = [f.model_dump(by_alias=True) for f in describe_files(staging)]
        manifest = ReleaseManifest.model_validate(
            {
                "version": args.version,
                "channel": args.channel,
                "minUpgradeFrom": args.min_upgrade_from,
                "publishedAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "images": images,
                "migrations": _heads(),
                "notesSha256": hashlib.sha256(notes).hexdigest(),
                "securityFix": args.security_fix,
                "files": files,
                "signingKeyId": "pending",
            }
        )
        signed, key_file = asyncio.run(_sign(manifest, args.key))
        if args.keys:
            Path(args.keys).write_text(json.dumps(key_file, indent=2) + "\n", encoding="utf-8")
        (out / f"nexuscampus-{args.version}.release.json").write_text(signed.to_json() + "\n", encoding="utf-8")
        if not args.online_only:
            tar = build_bundle(staging, signed, out / f"nexuscampus-{args.version}.tar")
            print(f"bundle: {tar} ({tar.stat().st_size // (1024 * 1024)} MB, {len(files)} files)")
    print(f"signed with {signed.manifest.signing_key_id}")


def main() -> None:
    utf8_console()
    p = argparse.ArgumentParser(prog="nexus-release-bundle")
    p.add_argument("--version", required=True)
    p.add_argument("--channel", required=True, choices=["stable", "lts", "preview"])
    p.add_argument("--min-upgrade-from", required=True)
    p.add_argument("--notes", required=True)
    p.add_argument("--image", action="append", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--online-only", action="store_true")
    p.add_argument("--security-fix", action="store_true")
    p.add_argument("--keys")
    p.add_argument("--key", default="nexus-release")
    bundle(p.parse_args())


def verify_main() -> None:
    utf8_console()
    p = argparse.ArgumentParser(prog="nexus-release-verify")
    p.add_argument("bundle")
    p.add_argument("--keys", required=True, help="public keys file pinned on the install")
    args = p.parse_args()
    keys = load_public_keys(json.loads(Path(args.keys).read_text(encoding="utf-8")))
    check = verify_bundle(Path(args.bundle), keys)
    if check.valid and check.release:
        m = check.release.manifest
        print(f"valid: NexusCampus {m.version} ({m.channel}), {len(m.files)} files, signed with {m.signing_key_id}")
        sys.exit(0)
    for problem in check.problems:
        print(f"refused: {problem}")
    sys.exit(1)


if __name__ == "__main__":
    main()
