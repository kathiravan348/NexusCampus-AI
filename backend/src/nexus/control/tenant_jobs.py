"""One open offboarding or portability move per tenant (D66, NEX-143)."""

import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection

from nexus.control.provisioning import offboarding_jobs, portability_jobs
from nexus.core.errors import ApiError, ApiErrorDetail

log = logging.getLogger("nexus.control.tenant_jobs")
OPEN_STATUSES = ("pending", "running")
BUSY_MESSAGE = "This tenant already has an offboarding or move in progress."
# Marks this 409 apart from the other conflicts of the same routes, so the dialogs can say why (NEX-143 review).
BUSY_DETAIL = ApiErrorDetail(path="tenantId", message="open_job")


async def ensure_no_open_job(
    conn: AsyncConnection,
    tenant_id: str,
    *,
    except_offboarding: str | None = None,
    except_move: str | None = None,
) -> None:
    """Takes a per-tenant transaction lock and raises 409 if any other offboarding or move is open."""
    await conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtext('tenant-job:' || CAST(:tid AS text)))"),
        {"tid": tenant_id},
    )

    off_q = select(offboarding_jobs.c.id).where(
        offboarding_jobs.c.tenant_id == tenant_id,
        offboarding_jobs.c.status.in_(OPEN_STATUSES),
    )
    if except_offboarding is not None:
        off_q = off_q.where(offboarding_jobs.c.id != except_offboarding)
    open_off = (await conn.execute(off_q.limit(1))).scalar_one_or_none()
    if open_off is not None:
        log.info(
            "tenant_job tenant=%s open_job=%s retry_offboarding=%s retry_move=%s outcome=busy",
            tenant_id,
            open_off,
            except_offboarding or "-",
            except_move or "-",
        )
        raise ApiError(409, "conflict", BUSY_MESSAGE, [BUSY_DETAIL])

    mov_q = select(portability_jobs.c.id).where(
        portability_jobs.c.tenant_id == tenant_id,
        portability_jobs.c.status.in_(OPEN_STATUSES),
    )
    if except_move is not None:
        mov_q = mov_q.where(portability_jobs.c.id != except_move)
    if except_offboarding is not None:
        # Retrying the linked offboarding job of a running cell-source move is part of that move.
        mov_q = mov_q.where(portability_jobs.c.offboarding_job_id.is_distinct_from(except_offboarding))
    open_mov = (await conn.execute(mov_q.limit(1))).scalar_one_or_none()
    if open_mov is not None:
        log.info(
            "tenant_job tenant=%s open_job=%s retry_offboarding=%s retry_move=%s outcome=busy",
            tenant_id,
            open_mov,
            except_offboarding or "-",
            except_move or "-",
        )
        raise ApiError(409, "conflict", BUSY_MESSAGE, [BUSY_DETAIL])
