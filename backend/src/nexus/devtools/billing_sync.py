"""`python -m nexus.devtools.billing_sync [--dry-run]`: pushes Control's billing metadata and learner counts into Lago
through `BillingEngine` (NEX-118, D51/D52).

Reads `nexus_control` as `control_app` (read-only). Uses `NEXUS_CONTROL_LAGO_API_URL` and `NEXUS_CONTROL_LAGO_API_KEY`
from `ControlSettings` (the API key is never printed). With `--dry-run`, runs against `FakeBillingEngine` and prints
what would be sent without contacting Lago.
"""

import argparse
import asyncio
import sys

import httpx2
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.billing.engine import BillingEngine, BillingUnavailable, FakeBillingEngine
from nexus.control.billing.lago import LagoBillingEngine
from nexus.control.billing.sync import SyncReport, sync_to_lago
from nexus.control.settings import ControlSettings, get_control_settings
from nexus.core.timing import utf8_console


async def _run(settings: ControlSettings, dry_run: bool) -> SyncReport:
    db = create_async_engine(settings.app_url(), pool_pre_ping=True)
    http = httpx2.AsyncClient(timeout=15.0)
    try:
        engine: BillingEngine = (
            FakeBillingEngine()
            if dry_run
            else LagoBillingEngine(settings.lago_api_url, settings.lago_api_key.get_secret_value().strip(), http)
        )
        async with db.connect() as conn:
            return await sync_to_lago(conn, engine, dry_run=dry_run)
    finally:
        await http.aclose()
        await db.dispose()


def _print_report(report: SyncReport) -> None:
    prefix = "dry-run" if report.dry_run else "synced"
    print(
        f"{prefix}: {len(report.plans)} plans, {len(report.customers)} customers, "
        f"{len(report.subscriptions)} subscriptions, {len(report.terminated)} ended, "
        f"{len(report.usage_events)} usage events, "
        f"{len(report.skipped)} skipped"
    )
    if report.dry_run:
        print(f"  plans: {', '.join(report.plans)}")
        print(f"  customers: {', '.join(report.customers)}")
        print(f"  subscriptions: {', '.join(report.subscriptions)}")
        print(f"  usage: {', '.join(report.usage_events)}")
    if report.terminated:
        print(f"  ended in Lago (cancelled in Control): {', '.join(report.terminated)}")
    for item in report.skipped:
        print(f"  skipped {item.id}: {item.reason}")


def main(argv: list[str] | None = None) -> None:
    utf8_console()
    parser = argparse.ArgumentParser(prog="python -m nexus.devtools.billing_sync")
    parser.add_argument("--dry-run", action="store_true", help="Run against FakeBillingEngine without calling Lago")
    args = parser.parse_args(argv)

    settings = get_control_settings()
    if not args.dry_run and not settings.lago_api_key.get_secret_value().strip():
        print("refused: NEXUS_CONTROL_LAGO_API_KEY is empty (set it or pass --dry-run)")
        sys.exit(1)

    try:
        report = asyncio.run(_run(settings, args.dry_run), loop_factory=asyncio.SelectorEventLoop)
    except BillingUnavailable as exc:
        print(f"failed: {exc}")
        sys.exit(1)

    _print_report(report)


if __name__ == "__main__":
    main()
