"""`uv run --project backend nexus-control-command ping <deployment-id>`: signs and queues a D60 command
on the control database (owner connection + OpenBao Transit key `nexus-command`, NEX-128).
"""

import argparse
import asyncio
import sys
from datetime import timedelta

import httpx2
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.commands import enqueue_command
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.settings import get_settings


async def queue_ping(deployment_id: str) -> str:
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
                    kind="ping",
                    args={},
                    issued_by="cli",
                    ttl=timedelta(minutes=10),
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
    args = parser.parse_args(argv)

    try:
        if sys.platform == "win32":
            cmd_id = asyncio.run(queue_ping(args.deployment_id), loop_factory=asyncio.SelectorEventLoop)
        else:
            cmd_id = asyncio.run(queue_ping(args.deployment_id))
    except (ValueError, RuntimeError) as exc:
        sys.exit(str(exc))
    print(cmd_id)


if __name__ == "__main__":
    main()
