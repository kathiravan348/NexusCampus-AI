"""`uv run --project backend nexus-control-command <ping|provision> <deployment-id> ...`: signs and queues a D60
command on the control database (owner connection + OpenBao Transit key `nexus-command`, NEX-128, NEX-127).
"""

import argparse
import asyncio
import sys
from datetime import timedelta
from typing import Any

import httpx2
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.commands import enqueue_command
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.settings import get_settings


async def queue_command(
    deployment_id: str,
    kind: str,
    args: dict[str, Any],
    *,
    tenant_id: str | None = None,
    ttl: timedelta = timedelta(minutes=10),
) -> str:
    cfg = get_control_settings()
    engine = create_async_engine(cfg.owner_url())
    async with httpx2.AsyncClient(timeout=10) as http:
        vault = HttpVault(get_settings(), http)
        try:
            async with engine.begin() as conn:
                return await enqueue_command(
                    conn,
                    vault,
                    deployment_id=deployment_id,
                    tenant_id=tenant_id,
                    kind=kind,
                    args=args,
                    issued_by="cli",
                    ttl=ttl,
                    key_name=cfg.command_signing_key,
                )
        finally:
            await engine.dispose()


def main(argv: list[str] | None = None) -> None:
    utf8_console()
    parser = argparse.ArgumentParser(prog="nexus-control-command")
    sub = parser.add_subparsers(dest="kind", required=True)
    ping_p = sub.add_parser("ping", help="Queue a signed ping command (expires in 10 min)")
    ping_p.add_argument("deployment_id", help="Target deployment id (e.g. dep-in-1)")

    prov_p = sub.add_parser("provision", help="Dev only: queue a signed tenant.provision command")
    prov_p.add_argument("deployment_id", help="Target cell deployment id (e.g. dep-in-1)")
    prov_p.add_argument("--tenant-id", required=True)
    prov_p.add_argument("--name", required=True)
    prov_p.add_argument("--type", dest="institution_type", default="k12")
    prov_p.add_argument("--region", default="in")
    prov_p.add_argument("--plan", dest="plan_code", required=True)
    prov_p.add_argument("--trial-days", type=int, default=None)
    prov_p.add_argument("--owner-name", required=True)
    prov_p.add_argument("--owner-email", required=True)
    args = parser.parse_args(argv)

    if args.kind == "ping":
        coro = queue_command(args.deployment_id, "ping", {})
    else:
        payload: dict[str, Any] = {
            "tenantId": args.tenant_id,
            "name": args.name,
            "institutionType": args.institution_type,
            "region": args.region,
            "planCode": args.plan_code,
            "trialDays": args.trial_days,
            "owner": {"legalName": args.owner_name, "workEmail": args.owner_email},
        }
        coro = queue_command(
            args.deployment_id, "tenant.provision", payload, tenant_id=args.tenant_id, ttl=timedelta(hours=1)
        )

    try:
        if sys.platform == "win32":
            cmd_id = asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)
        else:
            cmd_id = asyncio.run(coro)
    except (ValueError, RuntimeError) as exc:
        sys.exit(str(exc))
    print(cmd_id)


if __name__ == "__main__":
    main()
