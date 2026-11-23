"""Shared M83 inbox writer and agent decision sync for provider access requests (NEX-131, D22, D60).

Used by both the dev-only broker stub (`broker_stub.py`) and the M84 agent's `access_request.file` command handler.
Filing is idempotent by `request_id` and records `m83.accessRequest.filed` in the tenant's hash-chained audit log.
Nothing here can approve a request — approval stays strictly with the institution's admin in M83.
"""

import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Annotated, Any

from pydantic import Field, StringConstraints, ValidationError, model_validator
from sqlalchemy import Engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.commands.format import CommandPayload
from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError
from nexus.core.schemas import Contract
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.modules.m83.access import MAX_GRANT_HOURS, AccessRequestOut, Mode, ModuleId, Text, request_out
from nexus.settings import Settings

Ref = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,128}$")]
RequestId = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]


class BrokerCommandError(ValueError):
    """Raised when an `access_request.file` command must be rejected or failed with a machine reason."""

    def __init__(self, status: str, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


class InboxAccessRequest(Contract):
    request_id: RequestId
    staff_ref: Ref
    staff_display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    reason: Text
    modules: list[ModuleId] = Field(min_length=1)
    mode: Mode
    duration_hours: int = Field(ge=1, le=MAX_GRANT_HOURS)

    @model_validator(mode="after")
    def _validate_modules(self) -> "InboxAccessRequest":
        if len(set(self.modules)) != len(self.modules):
            raise ValueError("modules has duplicates")
        return self


async def file_access_request(
    session: AsyncSession,
    ctx: TenantContext,
    req: InboxAccessRequest,
) -> AccessRequestOut:
    """Inserts a pending M83 access request with `req.request_id` and audits it; idempotent on replay."""
    existing = await request_out(session, req.request_id)
    if existing is not None:
        return existing

    await session.execute(
        text(
            "INSERT INTO access_requests (id, tenant_id, staff_ref, staff_display_name, reason, modules, mode, "
            "duration_hours, status, requested_at) VALUES (:id, :t, :s, :n, :r, :m, :mode, :h, 'pending', :at)"
        ),
        {
            "id": req.request_id,
            "t": ctx.tenant_id,
            "s": req.staff_ref,
            "n": req.staff_display_name,
            "r": req.reason,
            "m": list(req.modules),
            "mode": req.mode,
            "h": req.duration_hours,
            "at": datetime.now(UTC),
        },
    )
    await record_audit(
        session,
        ctx,
        AuditInput(
            action="m83.accessRequest.filed",
            actor_kind="system",
            target_type="accessRequest",
            target_id=req.request_id,
            changes=changes("modules", "mode", "durationHours", "reason"),
        ),
    )
    filed = await request_out(session, req.request_id)
    assert filed is not None
    return filed


def _run_async(coro: Any) -> Any:
    def _runner() -> Any:
        if sys.platform == "win32":
            return asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)
        return asyncio.run(coro)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _runner()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_runner).result()


async def _file_in_tenant(db_url: str, tenant_id: str, req: InboxAccessRequest, settings: Settings) -> None:
    eng = create_async_engine(db_url)
    try:
        maker = async_sessionmaker(eng, expire_on_commit=False)
        ctx = TenantContext(tenant_id)
        async with tenant_transaction(maker, ctx, settings) as session:
            await file_access_request(session, ctx, req)
    finally:
        await eng.dispose()


def handle_access_request_file(cmd: CommandPayload, engine: Engine, settings: Settings) -> dict[str, Any]:
    """Agent handler for signed `access_request.file` commands: validates args, files into M83, tracks report row."""
    args = dict(cmd.args)
    tenant_id = args.pop("tenantId", None)
    if not isinstance(tenant_id, str) or not tenant_id or (cmd.tenant_id and tenant_id != cmd.tenant_id):
        raise BrokerCommandError("rejected", "invalid_args")
    try:
        req = InboxAccessRequest.model_validate(args)
    except ValidationError:
        raise BrokerCommandError("rejected", "invalid_args") from None
    if "M83" in req.modules:
        raise BrokerCommandError("rejected", "invalid_args")

    db_url = engine.url.render_as_string(hide_password=False)
    try:
        _run_async(_file_in_tenant(db_url, tenant_id, req, settings))
    except ApiError as exc:
        if exc.status in (401, 404, 503):
            raise BrokerCommandError("failed", "unknown_tenant") from None
        raise BrokerCommandError("failed", exc.code) from None

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO broker_reports (request_id, last_status, reported_at) "
                "VALUES (:id, NULL, NULL) ON CONFLICT (request_id) DO NOTHING"
            ),
            {"id": req.request_id},
        )
    return {"requestId": req.request_id}


def collect_pending_decisions(engine: Engine) -> list[dict[str, str]]:
    """Returns `{requestId, status, decidedAt}` for command-filed M83 requests whose status changed."""
    with engine.connect() as conn:
        tracked = conn.execute(
            text(
                "SELECT request_id, last_status FROM broker_reports "
                "WHERE last_status IS NULL OR last_status = 'approved'"
            )
        ).all()
        if not tracked:
            return []
        last_by_id = {str(r.request_id): r.last_status for r in tracked}
        rows = conn.execute(
            text("SELECT request_id, status, decided_at FROM nexus_broker_request_statuses(:ids)"),
            {"ids": list(last_by_id)},
        ).all()

    decisions: list[dict[str, str]] = []
    for cur in rows:
        if cur.status not in ("approved", "denied", "expired", "revoked"):
            continue
        if cur.status == last_by_id.get(str(cur.request_id)) or cur.decided_at is None:
            continue
        decided_utc = cur.decided_at.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        decisions.append({"requestId": str(cur.request_id), "status": str(cur.status), "decidedAt": decided_utc})
    return decisions


def mark_decisions_reported(engine: Engine, items: list[dict[str, str]], now: datetime) -> None:
    with engine.begin() as conn:
        for item in items:
            conn.execute(
                text("UPDATE broker_reports SET last_status = :status, reported_at = :now WHERE request_id = :id"),
                {"id": item["requestId"], "status": item["status"], "now": now},
            )
