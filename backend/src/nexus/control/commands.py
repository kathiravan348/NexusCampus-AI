"""Control → deployment signed pull-only commands (D60, NEX-128).

Install agents poll `GET /control/api/v1/agent/commands` with their per-deployment bearer token and post results to
`POST /control/api/v1/agent/commands/{id}/result`. Control never connects to a deployment. `control_app` has SELECT
and column-scoped UPDATE only; commands are inserted and signed by owner tooling (later tasks expand allowed kinds).
"""

import json
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, String, Table, Text, select, update
from sqlalchemy.dialects.postgresql import JSONB

from nexus.commands.format import DEFAULT_KEY, MAX_RESULT_BYTES, CommandPayload, new_command_id, sign_command
from nexus.control.fleet import AgentDeployment, agent_deployment, deployments
from nexus.control.resources import CamelModel, engine_of
from nexus.control.staff import metadata
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.vault import Vault

ID = 64
MAX_BATCH = 20
MAX_RESULT_BODY_BYTES = MAX_RESULT_BYTES + 512
MIN_POLL_INTERVAL_SECONDS = 30.0
ALLOWED_KINDS: frozenset[str] = frozenset({"ping", "access_request.file"})

log = logging.getLogger("nexus.control.commands")

deployment_commands = Table(
    "deployment_commands",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=True, index=True),
    Column("kind", String(64), nullable=False),
    Column("payload", Text, nullable=False),
    Column("signature", String(88), nullable=False),
    Column("status", String(16), nullable=False, server_default="pending"),
    Column("issued_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("delivered_at", DateTime(timezone=True), nullable=True),
    Column("finished_at", DateTime(timezone=True), nullable=True),
    Column("result", JSONB, nullable=True),
    CheckConstraint("id ~ '^cmd-[0-9a-f]{16}$'", name="dep_cmd_id_format"),
    CheckConstraint("signature ~ '^[A-Za-z0-9+/]{86}==$'", name="dep_cmd_signature_format"),
    CheckConstraint(
        "status IN ('pending', 'delivered', 'done', 'failed', 'rejected', 'expired')",
        name="dep_cmd_status_known",
    ),
    CheckConstraint(
        "expires_at > issued_at AND expires_at <= issued_at + interval '24 hours'", name="dep_cmd_ttl_range"
    ),
)


class SignedCommandItem(CamelModel):
    command: str
    signature: str


class AgentCommandList(CamelModel):
    items: list[SignedCommandItem]


class CommandResultInput(BaseModel):
    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)
    status: Literal["done", "failed", "rejected"]
    result: dict[str, Any]


class CommandResultAck(CamelModel):
    id: str
    status: Literal["done", "failed", "rejected"]


router = APIRouter(prefix="/control/api/v1", tags=["D60 commands"])


def _rate_limit_map(request: Request) -> dict[str, float]:
    store: dict[str, float] | None = getattr(request.app.state, "agent_commands_checked_at", None)
    if store is None:
        store = {}
        request.app.state.agent_commands_checked_at = store
    return store


async def _read_bounded(request: Request, limit: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > limit:
                raise ApiError(413, "invalid_request", f"Command result exceeds {MAX_RESULT_BYTES} bytes.")
        except ValueError:
            pass
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise ApiError(413, "invalid_request", f"Command result exceeds {MAX_RESULT_BYTES} bytes.")
    return bytes(buf)


def _utc_z(dt: datetime) -> str:
    return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def enqueue_command(
    conn: Any,
    vault: Vault,
    *,
    deployment_id: str,
    kind: str,
    args: dict[str, Any],
    issued_by: str,
    tenant_id: str | None = None,
    ttl: timedelta = timedelta(minutes=10),
    key_name: str = DEFAULT_KEY,
) -> str:
    """Signs and inserts one command row into `deployment_commands` (caller provides an owner/writer connection)."""
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"Unsupported command kind: {kind}")
    dep = (
        await conn.execute(select(deployments.c.id, deployments.c.air_gapped).where(deployments.c.id == deployment_id))
    ).first()
    if dep is None:
        raise ValueError(f"Unknown deployment: {deployment_id}")
    if dep.air_gapped:
        raise ValueError(f"Air-gapped deployment cannot receive commands: {deployment_id}")

    now = datetime.now(UTC).replace(microsecond=0)
    expires = now + ttl
    cmd = CommandPayload(
        id=new_command_id(),
        deployment_id=deployment_id,
        tenant_id=tenant_id,
        kind=kind,
        args=args,
        issued_at=_utc_z(now),
        expires_at=_utc_z(expires),
        issued_by=issued_by,
        signing_key_id=f"{key_name}:v0",
    )
    raw, signature = await sign_command(vault, key_name, cmd)
    await conn.execute(
        deployment_commands.insert().values(
            id=cmd.id,
            deployment_id=deployment_id,
            tenant_id=tenant_id,
            kind=kind,
            payload=raw,
            signature=signature,
            status="pending",
            issued_at=now,
            expires_at=expires,
        )
    )
    return cmd.id


@router.get("/agent/commands", response_model=AgentCommandList, response_model_by_alias=True)
async def fetch_agent_commands(
    request: Request,
    agent: Annotated[AgentDeployment, Depends(agent_deployment)],
) -> AgentCommandList:
    """Returns up to 20 unexpired pending/delivered commands for the authenticated deployment."""
    if agent.air_gapped:
        log.info("agent commands fetch deployment=%s outcome=air_gapped", agent.id)
        raise ApiError(403, "forbidden", "Air-gapped deployments do not receive commands.")

    checked = _rate_limit_map(request)
    mono = time.monotonic()
    last = checked.get(agent.id)
    if last is not None and (mono - last) < MIN_POLL_INTERVAL_SECONDS:
        log.info("agent commands fetch deployment=%s outcome=rate_limited", agent.id)
        raise ApiError(429, "rate_limited", "At most one command fetch per 30 seconds is allowed.")
    checked[agent.id] = mono

    now = datetime.now(UTC)
    dc = deployment_commands.c
    async with engine_of(request).begin() as conn:
        await conn.execute(
            update(deployment_commands)
            .where(dc.deployment_id == agent.id, dc.status.in_(("pending", "delivered")), dc.expires_at <= now)
            .values(status="expired")
        )
        rows = (
            await conn.execute(
                select(dc.id, dc.payload, dc.signature, dc.status)
                .where(dc.deployment_id == agent.id, dc.status.in_(("pending", "delivered")), dc.expires_at > now)
                .order_by(dc.issued_at.asc(), dc.id.asc())
                .limit(MAX_BATCH)
                .with_for_update()
            )
        ).all()
        pending_ids = [row.id for row in rows if row.status == "pending"]
        if pending_ids:
            await conn.execute(
                update(deployment_commands).where(dc.id.in_(pending_ids)).values(status="delivered", delivered_at=now)
            )

    items = [SignedCommandItem(command=row.payload, signature=row.signature) for row in rows]
    log.info("agent commands fetch deployment=%s count=%d outcome=ok", agent.id, len(items))
    return AgentCommandList(items=items)


@router.post("/agent/commands/{command_id}/result", response_model=CommandResultAck, response_model_by_alias=True)
async def report_command_result(
    command_id: str,
    request: Request,
    agent: Annotated[AgentDeployment, Depends(agent_deployment)],
) -> CommandResultAck:
    """Records one terminal result for a deployment's own command (once only)."""
    if agent.air_gapped:
        log.info("agent command result command=%s deployment=%s outcome=air_gapped", command_id, agent.id)
        raise ApiError(403, "forbidden", "Air-gapped deployments do not report command results.")

    try:
        raw = await _read_bounded(request, MAX_RESULT_BODY_BYTES)
    except ApiError:
        log.info("agent command result command=%s deployment=%s outcome=payload_too_large", command_id, agent.id)
        raise

    try:
        body = CommandResultInput.model_validate_json(raw)
    except ValidationError as exc:
        log.info("agent command result command=%s deployment=%s outcome=invalid", command_id, agent.id)
        details = [
            ApiErrorDetail(path=".".join(str(p) for p in err["loc"]), message=str(err["msg"])) for err in exc.errors()
        ]
        raise ApiError(400, "invalid_request", "The command result is not valid.", details) from None

    if len(json.dumps(body.result, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > MAX_RESULT_BYTES:
        log.info("agent command result command=%s deployment=%s outcome=result_too_large", command_id, agent.id)
        raise ApiError(413, "invalid_request", f"Command result exceeds {MAX_RESULT_BYTES} bytes.")

    now = datetime.now(UTC)
    dc = deployment_commands.c
    async with engine_of(request).begin() as conn:
        row = (
            await conn.execute(
                select(dc.id, dc.kind, dc.status, dc.expires_at, dc.delivered_at)
                .where(dc.id == command_id, dc.deployment_id == agent.id)
                .with_for_update()
            )
        ).first()
        if row is None:
            log.info("agent command result command=%s deployment=%s outcome=not_found", command_id, agent.id)
            raise ApiError(404, "not_found", "Command not found.")
        if row.status in ("done", "failed", "rejected", "expired"):
            log.info(
                "agent command result command=%s deployment=%s kind=%s status=%s outcome=conflict",
                command_id,
                agent.id,
                row.kind,
                row.status,
            )
            raise ApiError(409, "conflict", "Command already has a final status.")
        if row.expires_at <= now:
            await conn.execute(update(deployment_commands).where(dc.id == command_id).values(status="expired"))
            await conn.commit()  # keep `expired` although the request ends in 409 (review NEX-128)
            log.info(
                "agent command result command=%s deployment=%s kind=%s status=expired outcome=conflict",
                command_id,
                agent.id,
                row.kind,
            )
            raise ApiError(409, "conflict", "Command has expired.")

        await conn.execute(
            update(deployment_commands)
            .where(dc.id == command_id)
            .values(status=body.status, delivered_at=row.delivered_at or now, finished_at=now, result=body.result)
        )

    log.info(
        "agent command result command=%s deployment=%s kind=%s status=%s outcome=ok",
        command_id,
        agent.id,
        row.kind,
        body.status,
    )
    return CommandResultAck(id=command_id, status=body.status)
