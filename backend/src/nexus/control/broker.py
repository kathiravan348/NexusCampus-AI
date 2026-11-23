"""P10 access broker on Control (NEX-125, D22, D60).

Staff file time-boxed access requests (`POST /broker-requests`) which queue a signed `access_request.file` command
for the tenant's deployment. The institution decides in M83 and its agent reports decisions back via
`POST /control/api/v1/agent/access-decisions`. Control never decides access itself.
"""

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import ARRAY, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.commands.format import CommandVerificationError
from nexus.control.accounts import accounts
from nexus.control.commands import enqueue_command
from nexus.control.fleet import AgentDeployment, agent_deployment, deployments
from nexus.control.resources import CamelModel, Resource, engine_of, mount
from nexus.control.settings import ControlSettings
from nexus.control.staff import Id, ModuleId, UtcDateTime, metadata, staff_users
from nexus.control.support import tickets
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.vault import Vault

ID = 64
MAX_DECISIONS_BATCH = 50
log = logging.getLogger("nexus.control.broker")

broker_requests = Table(
    "broker_requests",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=False, index=True),
    Column("requested_by_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("ticket_id", String(ID), ForeignKey(tickets.c.id), nullable=True, index=True),
    Column("reason", String(2000), nullable=False),
    Column("modules", ARRAY(Text), nullable=False),
    Column("mode", String(8), nullable=False),
    Column("duration_hours", Integer, nullable=False),
    Column("status", String(16), nullable=False),
    Column("requested_at", DateTime(timezone=True), nullable=False),
    Column("decided_at", DateTime(timezone=True), nullable=True),
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), nullable=True, index=True),
)

broker_sessions = Table(
    "broker_sessions",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("request_id", String(ID), ForeignKey(broker_requests.c.id), nullable=False, index=True),
    Column("grant_id", String(ID), nullable=False),
    Column("staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("starts_at", DateTime(timezone=True), nullable=False),
    Column("ends_at", DateTime(timezone=True), nullable=False),
    Column("recorded", Boolean, nullable=False),
    Column("actions_count", Integer, nullable=False),
    Column("ended_early_at", DateTime(timezone=True), nullable=True),
)

break_glass_cases = Table(
    "break_glass_cases",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("tenant_id", String(ID), nullable=False),
    Column("category", String(32), nullable=False),
    Column("justification", String(4000), nullable=False),
    Column("approver_staff_ids", ARRAY(Text), nullable=False),
    Column("opened_at", DateTime(timezone=True), nullable=False),
    Column("institution_notified_at", DateTime(timezone=True), nullable=False),
    Column("closed_at", DateTime(timezone=True), nullable=True),
    Column("report_delivered_at", DateTime(timezone=True), nullable=True),
)


class BrokerRequest(CamelModel):
    id: Id
    account_id: Id
    tenant_id: Id
    requested_by_staff_id: Id
    ticket_id: Id | None
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    modules: Annotated[list[ModuleId], Field(min_length=1)]
    mode: Literal["read", "edit"]
    duration_hours: Annotated[int, Field(ge=1, le=72)]
    status: Literal["pending", "approved", "denied", "expired", "revoked", "ended"]
    requested_at: UtcDateTime
    decided_at: UtcDateTime | None


class BrokerSession(CamelModel):
    id: Id
    request_id: Id
    grant_id: Id
    staff_id: Id
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    recorded: Literal[True]
    actions_count: Annotated[int, Field(ge=0)]
    ended_early_at: UtcDateTime | None


class BreakGlassCase(CamelModel):
    id: Id
    account_id: Id
    tenant_id: Id
    category: Literal["legal_order", "security_incident"]
    justification: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=4000)]
    approver_staff_ids: tuple[Id, Id]
    opened_at: UtcDateTime
    institution_notified_at: UtcDateTime
    closed_at: UtcDateTime | None
    report_delivered_at: UtcDateTime | None


class NewBrokerRequestInput(BaseModel):
    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)
    account_id: Annotated[Id, Field(alias="accountId")]
    tenant_id: Annotated[Id, Field(alias="tenantId")]
    ticket_id: Annotated[Id | None, Field(alias="ticketId")] = None
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    modules: Annotated[list[ModuleId], Field(min_length=1)]
    mode: Literal["read", "edit"]
    duration_hours: Annotated[int, Field(alias="durationHours", ge=1, le=72)]


class AccessDecisionItem(BaseModel):
    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)
    request_id: Annotated[Id, Field(alias="requestId")]
    status: Literal["approved", "denied", "expired", "revoked"]
    decided_at: Annotated[UtcDateTime, Field(alias="decidedAt")]


class AccessDecisionsInput(BaseModel):
    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)
    items: Annotated[list[AccessDecisionItem], Field(max_length=MAX_DECISIONS_BATCH)]


class AccessDecisionsAck(CamelModel):
    updated: int
    ignored: int


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("broker_requests", broker_requests, BrokerRequest, "id"),
    ("broker_sessions", broker_sessions, BrokerSession, "id"),
    ("break_glass_cases", break_glass_cases, BreakGlassCase, "id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P10 access broker"])
BROKER_REQUESTS = Resource(
    "broker-requests",
    broker_requests,
    BrokerRequest,
    "ctl.broker.read",
    {"accountId": "account_id", "status": "status", "ticketId": "ticket_id"},
)
BROKER_SESSIONS = Resource(
    "broker-sessions", broker_sessions, BrokerSession, "ctl.broker.read", {"requestId": "request_id"}, key=None
)
BREAK_GLASS_CASES = Resource(
    "break-glass-cases", break_glass_cases, BreakGlassCase, "ctl.broker.read", {"accountId": "account_id"}
)
for resource in (BROKER_REQUESTS, BROKER_SESSIONS, BREAK_GLASS_CASES):
    mount(router, resource)

Requester = Annotated[Viewer, Depends(require("ctl.broker.request"))]


async def _resolve_tenant_deployment(conn: Any, account_id: str, region: str, delivery_model: str) -> Any:
    dedicated = (
        await conn.execute(
            select(deployments.c.id, deployments.c.air_gapped).where(
                deployments.c.account_id == account_id, deployments.c.kind == "saas_dedicated_cell"
            )
        )
    ).first()
    if dedicated is not None:
        return dedicated
    if delivery_model == "self_hosted":
        return None
    return (
        await conn.execute(
            select(deployments.c.id, deployments.c.air_gapped).where(
                deployments.c.kind == "saas_shared_cell", deployments.c.region == region
            )
        )
    ).first()


@router.post("/broker-requests", response_model=BrokerRequest, response_model_by_alias=True, status_code=201)
async def create_broker_request(body: NewBrokerRequestInput, request: Request, viewer: Requester) -> BrokerRequest:
    """Files a pending access request and queues a signed `access_request.file` command for the tenant's cell."""
    if "M83" in body.modules:
        raise ApiError(
            422,
            "invalid_request",
            "The data vault itself is never in scope.",
            [ApiErrorDetail(path="modules", message="The data vault itself is never in scope.")],
        )
    if len(set(body.modules)) != len(body.modules):
        raise ApiError(
            400,
            "invalid_request",
            "Modules must not repeat.",
            [ApiErrorDetail(path="modules", message="modules has duplicates")],
        )
    if viewer.account_ids is not None and body.account_id not in viewer.account_ids:
        raise ApiError(404, "not_found", "Account not found.")

    cfg: ControlSettings = request.app.state.settings
    vault: Vault = request.app.state.vault
    now = datetime.now(UTC).replace(microsecond=0)
    req_id = f"acr-{secrets.token_hex(8)}"

    async with engine_of(request).begin() as conn:
        acc = (
            await conn.execute(
                select(accounts.c.id, accounts.c.region, accounts.c.delivery_model, accounts.c.tenant_ids).where(
                    accounts.c.id == body.account_id
                )
            )
        ).first()
        if acc is None:
            raise ApiError(404, "not_found", "Account not found.")
        if acc.delivery_model == "self_hosted":
            raise ApiError(409, "conflict", "Self-hosted installs do not receive Control access requests.")
        if body.tenant_id not in list(acc.tenant_ids):
            raise ApiError(404, "not_found", "Tenant not found on account.")
        if body.ticket_id is not None:
            tck = (
                await conn.execute(
                    select(tickets.c.id).where(tickets.c.id == body.ticket_id, tickets.c.account_id == body.account_id)
                )
            ).first()
            if tck is None:
                raise ApiError(404, "not_found", "Ticket not found on account.")

        dep = await _resolve_tenant_deployment(conn, str(acc.id), str(acc.region), str(acc.delivery_model))
        if dep is None or dep.air_gapped:
            raise ApiError(409, "conflict", "Tenant has no reachable deployment for access requests.")

        inserted = (
            (
                await conn.execute(
                    broker_requests.insert()
                    .values(
                        id=req_id,
                        account_id=body.account_id,
                        tenant_id=body.tenant_id,
                        requested_by_staff_id=viewer.staff_id,
                        ticket_id=body.ticket_id,
                        reason=body.reason,
                        modules=list(body.modules),
                        mode=body.mode,
                        duration_hours=body.duration_hours,
                        status="pending",
                        requested_at=now,
                        decided_at=None,
                        deployment_id=str(dep.id),
                    )
                    .returning(broker_requests)
                )
            )
            .mappings()
            .one()
        )
        try:
            cmd_id = await enqueue_command(
                conn,
                vault,
                deployment_id=str(dep.id),
                tenant_id=body.tenant_id,
                kind="access_request.file",
                args={
                    "requestId": req_id,
                    "tenantId": body.tenant_id,
                    "staffRef": viewer.staff_id,
                    "staffDisplayName": f"{viewer.session.staff.display_name} (Nexus Support)",
                    "reason": body.reason,
                    "modules": list(body.modules),
                    "mode": body.mode,
                    "durationHours": body.duration_hours,
                },
                issued_by=viewer.staff_id,
                ttl=timedelta(hours=24),
                key_name=cfg.command_signing_key,
            )
        except CommandVerificationError as exc:
            raise ApiError(400, "invalid_request", str(exc)) from None

    log.info("broker request created id=%s staff=%s deployment=%s command=%s", req_id, viewer.staff_id, dep.id, cmd_id)
    return BrokerRequest.model_validate(BROKER_REQUESTS.parse(inserted).model_dump())


@router.post("/agent/access-decisions", response_model=AccessDecisionsAck, response_model_by_alias=True)
async def report_access_decisions(
    body: AccessDecisionsInput,
    request: Request,
    agent: Annotated[AgentDeployment, Depends(agent_deployment)],
) -> AccessDecisionsAck:
    """Records M83 access-request decisions reported by the deployment that received the request."""
    if agent.air_gapped:
        raise ApiError(403, "forbidden", "Air-gapped deployments do not report access decisions.")

    updated = ignored = 0
    async with engine_of(request).begin() as conn:
        for item in body.items:
            mapped = "ended" if item.status == "expired" else item.status
            row = (
                await conn.execute(
                    select(
                        broker_requests.c.id,
                        broker_requests.c.status,
                        broker_requests.c.requested_at,
                        broker_requests.c.deployment_id,
                    )
                    .where(broker_requests.c.id == item.request_id)
                    .with_for_update()
                )
            ).first()
            if row is None or row.deployment_id != agent.id:
                ignored += 1
                continue
            can_apply = row.status == "pending" or (row.status == "approved" and mapped in ("revoked", "ended"))
            if not can_apply:
                ignored += 1
                continue
            decided = max(datetime.fromisoformat(item.decided_at.replace("Z", "+00:00")), row.requested_at)
            await conn.execute(
                update(broker_requests)
                .where(broker_requests.c.id == item.request_id)
                .values(status=mapped, decided_at=decided)
            )
            log.info("broker decision id=%s deployment=%s status=%s", item.request_id, agent.id, mapped)
            updated += 1

    return AccessDecisionsAck(updated=updated, ignored=ignored)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo broker requests, sessions, and break-glass cases, after accounts, staff and tickets."""
    from nexus.control.rows import to_db

    count = 0
    for key, table, model, pk in SEED_TABLES:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=[pk], set_={k: v for k, v in row.items() if k != pk})
            )
            count += 1
    return count
