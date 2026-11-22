"""`nexus-agent` (M84) — runs only on a self-hosted install (`NEXUS_INSTALL_MODE=self_hosted`).

  once | loop [--every SECONDS]   licence, counts, update offer → install status (NEX-105) + health report (NEX-114)
  report                          measure health and send one PII-free check-in to Control (NEX-114)
  backup                          encrypted backup of every table (NEX-112)
  verify-backup FILE              read the whole backup through its checks (no restore)
  restore FILE --into URL         load a backup into an EMPTY database (schema built first)
  import-key                      ensure Transit `tenant-import` RSA-4096 key exists and print its public PEM (NEX-106)
  export-tenant ID --to PEM       export one tenant encrypted for the destination's import PEM (NEX-106)
  diagnostics [--ticket REF]      support bundle with personal data removed, waiting for an admin's review

Prints counts, sizes and versions — never people.
"""

import argparse
import asyncio
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path

import httpx2
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine

from nexus.agent.backup import backup_header, restore_backup, verify_backup
from nexus.agent.health import report_skip_reason, send_report
from nexus.agent.jobs import ensure_import_key, run_backup, run_diagnostics, run_tenant_export
from nexus.agent.licence import check_licence, load_keys
from nexus.agent.online import OnlineCheckResult, check_online
from nexus.agent.state import RunResult, run_once
from nexus.agent.updates import RELEASE_KEYS
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.settings import BACKEND_ROOT, Settings, get_settings


def _report(r: RunResult) -> None:
    licence = f"licence problem: {r.licence_problem}" if r.licence_problem else "licence verified"
    update = f"update {r.offer_version} available" if r.offer_version else "no update offered"
    print(f"install: {r.tenants} tenants, {r.learners} learners, {r.campuses} campuses; {licence}; {update}")
    for reason in r.skipped:
        print(f"  not offered: {reason}")


def _check_online_updates(settings: Settings) -> OnlineCheckResult:
    day = datetime.now(UTC).date()
    keys_path = settings.install_dir / RELEASE_KEYS
    try:
        keys = load_keys(keys_path) if keys_path.exists() else {}
    except (OSError, ValueError):
        keys = {}
    licence = check_licence(settings.install_dir, day, 0, 0)
    support_ends = date.fromisoformat(licence.summary["supportEndsAt"]) if licence.summary else None
    return check_online(settings, keys, settings.app_version, support_ends)


def _status(settings: Settings, loop: bool, every: int) -> None:
    engine = create_engine(settings.database_url.get_secret_value(), pool_pre_ping=True)
    try:
        while True:
            online = _check_online_updates(settings)
            print(f"online update: {online.message}")
            with engine.begin() as conn:
                _report(run_once(conn, settings, online=online))
            skip = report_skip_reason(settings)
            if skip is not None:
                print(f"health report: {skip}")
            else:
                try:
                    with engine.connect() as conn:
                        print(f"health report: {send_report(conn, settings).message}")
                except Exception as exc:  # a failed measurement never stops the licence and update checks
                    print(f"health report: failed ({type(exc).__name__})")
            if not loop:
                return
            time.sleep(max(60, every))
    finally:
        engine.dispose()


def _health_report(settings: Settings) -> None:
    skip = report_skip_reason(settings)
    if skip is not None:
        print(f"health report: {skip}")
        return
    engine = create_engine(settings.database_url.get_secret_value(), pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            print(f"health report: {send_report(conn, settings).message}")
    finally:
        engine.dispose()


def _unwrap(settings: Settings, path: Path) -> bytes:
    header = backup_header(path)

    async def run() -> bytes:
        async with httpx2.AsyncClient(timeout=30) as http:
            vault = HttpVault(settings, http)
            return await vault.unwrap(str(header.fields["keyName"]), str(header.fields["wrappedKey"]))

    return asyncio.run(run())


def _restore(settings: Settings, path: Path, target: str) -> None:
    header = backup_header(path)
    cfg = Config(str(Path(BACKEND_ROOT) / "alembic.ini"))
    cfg.attributes["url"] = target
    cfg.attributes["app_db_password"] = settings.app_db_password.get_secret_value()
    command.upgrade(cfg, str(header.fields["revision"]))
    counts = restore_backup(path, _unwrap(settings, path), target)
    print(f"restored {len(counts)} tables, {sum(counts.values())} rows (schema {header.fields['revision']})")


def main() -> None:
    utf8_console()
    p = argparse.ArgumentParser(prog="nexus-agent")
    p.add_argument("mode", nargs="?", default="once")
    p.add_argument("file", nargs="?")
    p.add_argument("--every", type=int, default=3600)
    p.add_argument("--into")
    p.add_argument("--to")
    p.add_argument("--ticket")
    args = p.parse_args()
    settings = get_settings()
    if settings.install_mode != "self_hosted":
        sys.exit("The install agent runs only on a self-hosted install (NEXUS_INSTALL_MODE=self_hosted).")
    if args.mode in ("once", "loop"):
        _status(settings, args.mode == "loop", args.every)
    elif args.mode == "report":
        _health_report(settings)
    elif args.mode == "backup":
        done = run_backup(settings)
        print(f"backup {done['id']}: {done['tables']} tables, {done['bytes']} bytes, encrypted → {done['file']}")
    elif args.mode == "verify-backup" and args.file:
        path = Path(args.file)
        with path.open("rb") as src:
            print(f"backup verified: {verify_backup(src, _unwrap(settings, path))} plaintext bytes, every chunk intact")
    elif args.mode == "restore" and args.file and args.into:
        _restore(settings, Path(args.file), args.into)
    elif args.mode == "import-key":
        pem = ensure_import_key(settings)
        print(pem, end="" if pem.endswith("\n") else "\n")
    elif args.mode == "export-tenant" and args.file and args.to:
        done = run_tenant_export(settings, args.file, Path(args.to))
        print(
            f"tenant export {done['id']} ({done['tenantId']}): "
            f"{done['tables']} tables, {done['rows']} rows, {done['bytes']} bytes, encrypted → {done['file']}"
        )
    elif args.mode == "diagnostics":
        done = run_diagnostics(settings, args.ticket)
        print(f"diagnostics {done['id']}: {done['bytes']} bytes, waiting for an admin's review → {done['file']}")
    else:
        p.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
