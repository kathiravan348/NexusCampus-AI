"""One path from a command's end to the job that waited for it (D60, D63, NEX-139).

`apply_command_result` forwards a reported (or expired) command result to the job that queued it: provisioning,
offboarding, moves or the access broker. `expire_commands` marks overdue `pending` / `delivered` commands `expired`
and fails what waited on them; it runs on the agent's fetch, on a late result, in Control's sweep loop and from
`nexus-control-command sweep`. A person retries a failed job; nothing here queues a new command.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine

from nexus.control.settings import ControlSettings
from nexus.core.vault import Vault

MAX_SWEEP = 100
EXPIRED_RESULT: dict[str, Any] = {"reason": "command_expired"}
log = logging.getLogger("nexus.control.command_expiry")


async def apply_command_result(
    conn: Any, vault: Vault, cfg: ControlSettings, command_id: str, kind: str, status: str, result: dict[str, Any]
) -> None:
    """Moves the job linked to `command_id` on; `status` is the command's final status (`expired` counts as failed)."""
    job_status = "failed" if status == "expired" else status
    if kind == "tenant.provision":
        from nexus.control.provisioning import apply_provisioning_result

        await apply_provisioning_result(conn, command_id, job_status, result)
    if kind in ("tenant.freeze", "tenant.export", "tenant.destroy_keys"):
        from nexus.control.offboarding import apply_offboarding_result

        await apply_offboarding_result(conn, vault, cfg, command_id, kind, job_status, result)
    if kind in ("tenant.freeze", "tenant.export", "tenant.import_key", "tenant.import"):
        from nexus.control.moves import apply_move_result

        await apply_move_result(conn, vault, cfg, command_id, kind, job_status, result)


async def _expire_access_request(conn: Any, payload: str, now: datetime) -> None:
    from nexus.control.broker import broker_requests

    try:
        request_id = json.loads(payload)["args"]["requestId"]
    except (ValueError, KeyError, TypeError):
        return
    if not isinstance(request_id, str):
        return
    br = broker_requests.c
    await conn.execute(
        update(broker_requests)
        .where(br.id == request_id, br.status == "pending")
        .values(status="expired", decided_at=now)
    )


async def expire_commands(
    conn: Any,
    vault: Vault,
    cfg: ControlSettings,
    now: datetime,
    *,
    deployment_id: str | None = None,
    command_id: str | None = None,
) -> int:
    """Marks overdue commands `expired` (each row once, `SKIP LOCKED`) and fails what waited on them."""
    from nexus.control.commands import deployment_commands

    dc = deployment_commands.c
    query = select(dc.id, dc.kind, dc.payload).where(dc.status.in_(("pending", "delivered")), dc.expires_at <= now)
    if deployment_id is not None:
        query = query.where(dc.deployment_id == deployment_id)
    if command_id is not None:
        query = query.where(dc.id == command_id)
    rows = (
        await conn.execute(
            query.order_by(dc.expires_at.asc(), dc.id.asc()).limit(MAX_SWEEP).with_for_update(skip_locked=True)
        )
    ).all()
    for row in rows:
        await conn.execute(update(deployment_commands).where(dc.id == row.id).values(status="expired"))
        try:
            # One savepoint per row: a job that cannot be moved on must not block every other expiry (or the fetch).
            async with conn.begin_nested():
                if row.kind == "access_request.file":
                    await _expire_access_request(conn, str(row.payload), now)
                else:
                    await apply_command_result(conn, vault, cfg, str(row.id), str(row.kind), "expired", EXPIRED_RESULT)
        except Exception as exc:
            log.warning("command expired command=%s kind=%s job=error err=%s", row.id, row.kind, type(exc).__name__)
            continue
        log.info("command expired command=%s kind=%s", row.id, row.kind)
    return len(rows)


async def sweep_once(engine: AsyncEngine, vault: Vault, cfg: ControlSettings) -> int:
    """One sweep over every deployment, in its own transaction."""
    async with engine.begin() as conn:
        return await expire_commands(conn, vault, cfg, datetime.now(UTC))


async def sweep_loop(engine: AsyncEngine, vault: Vault, cfg: ControlSettings) -> None:
    """Runs `sweep_once` every `command_sweep_seconds` until cancelled; an error is logged by type, then it goes on."""
    while True:
        await asyncio.sleep(cfg.command_sweep_seconds)
        try:
            expired = await sweep_once(engine, vault, cfg)
            if expired:
                log.info("command sweep expired=%d", expired)
        except Exception as exc:  # the loop must outlive a database or vault hiccup
            log.warning("command sweep outcome=error err=%s", type(exc).__name__)
