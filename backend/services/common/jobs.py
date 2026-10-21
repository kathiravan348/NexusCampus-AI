"""
Background jobs & scheduler (Build Spec §3.5).
- Modules register jobs with @job(code, name, interval_minutes).
- Each run is recorded in job_runs and audited (job.completed / job.failed).
- Failure raises a CRITICAL alert to platform admins (throttled).
"""
import asyncio
import logging
from datetime import datetime, timezone

from . import db, recipients, tenancy
from .audit import SystemCtx, audit
from .config import SCHEDULER_INTERVAL_SECONDS
from .notify import notify

logger = logging.getLogger("nexus.jobs")
JOBS: dict[str, dict] = {}


def job(code: str, name: str, interval_minutes: int):
    def decorator(fn):
        JOBS[code] = {"code": code, "name": name, "interval_minutes": interval_minutes, "fn": fn}
        return fn
    return decorator


async def run_job(tenant: dict, code: str, actor=None) -> dict:
    spec = JOBS.get(code)
    if not spec:
        raise KeyError(code)
    ctx = actor or SystemCtx(tenant)
    async with db.transaction(tenant["db_name"]) as conn:
        run_id = await conn.fetchval(
            "INSERT INTO job_runs (job_code, status, started_at, source) VALUES ($1, 'running', now(), 'system') RETURNING id",
            code)
    try:
        async with db.transaction(tenant["db_name"]) as conn:
            summary = await spec["fn"](conn, ctx, tenant) or {}
            await conn.execute("UPDATE job_runs SET status = 'completed', finished_at = now(), summary = $2 WHERE id = $1",
                               run_id, summary)
            await audit(conn, ctx, "job.completed", "job", code, after=summary)
        return {"job_code": code, "status": "completed", "summary": summary}
    except Exception as exc:  # noqa: BLE001 - record every failure
        logger.exception("job %s failed for tenant %s", code, tenant.get("slug"))
        async with db.transaction(tenant["db_name"]) as conn:
            await conn.execute("UPDATE job_runs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1",
                               run_id, str(exc)[:1000])
            await audit(conn, ctx, "job.failed", "job", code, after={"error": str(exc)[:500]})
            admins = await recipients.with_permission(conn, "platform.jobs.manage")
            await notify(conn, ctx, event_code="job.failed", severity="CRITICAL", user_ids=admins,
                         title=f"Background job failed: {spec['name']}", body=str(exc)[:300],
                         link="/core/jobs", category="system", throttle_key=f"job-failed:{code}", throttle_hours=6)
        return {"job_code": code, "status": "failed", "error": str(exc)}


async def run_due_jobs(tenant: dict) -> None:
    async with db.connection(tenant["db_name"]) as conn:
        last = {r["job_code"]: r["started_at"] for r in await conn.fetch(
            "SELECT job_code, max(started_at) AS started_at FROM job_runs GROUP BY job_code")}
    now = datetime.now(timezone.utc)
    for code, spec in JOBS.items():
        started = last.get(code)
        if started is None or (now - started).total_seconds() >= spec["interval_minutes"] * 60:
            await run_job(tenant, code)


async def scheduler_loop() -> None:
    await asyncio.sleep(3)
    while True:
        try:
            for tenant in await tenancy.list_tenants(active_only=True):
                await run_due_jobs(tenant)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("scheduler loop error")
        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)
