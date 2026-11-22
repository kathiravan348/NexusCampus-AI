"""P06 fleet registry, latest health signals and outbound agent health check-ins (NEX-113).

Installs talk to Nexus Control outbound only (V-6), carrying counts, rates and timings without personal data (V-4, V-7).
Agent check-ins authenticate solely with a per-deployment bearer token (SHA-256 stored in `deployment_agent_tokens`,
issued by the owner-role CLI `nexus-control-agent-token`); staff cookies are never accepted.
"""

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, field_validator
from sqlalchemy import (
    ARRAY,
    CHAR,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    func,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, engine_of, mount
from nexus.control.staff import metadata
from nexus.core.errors import ApiError, ApiErrorDetail

ID = 64
MAX_REPORT_BYTES = 4096
MIN_REPORT_INTERVAL = timedelta(seconds=60)
_SEMVER = r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$"
_UTC_ISO = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$"

log = logging.getLogger("nexus.control.fleet")

deployments = Table(
    "deployments",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("kind", String(24), nullable=False),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=True, index=True),
    Column("region", String(8), nullable=False),
    Column("version", String(64), nullable=False),
    Column("channel", String(16), nullable=False),
    Column("health", String(16), nullable=False),
    Column("last_check_in_at", DateTime(timezone=True), nullable=True),
    Column("telemetry_enabled", Boolean, nullable=False),
    Column("air_gapped", Boolean, nullable=False),
    Column("extension_ids", ARRAY(Text), nullable=False),
    Column("tenant_count", Integer, nullable=False),
    CheckConstraint("(kind = 'saas_shared_cell') = (account_id IS NULL)", name="deployments_shared_cell_no_account"),
    CheckConstraint("telemetry_enabled OR health = 'unknown'", name="deployments_no_telemetry_unknown_health"),
    CheckConstraint(
        "NOT air_gapped OR kind NOT IN ('saas_shared_cell', 'saas_dedicated_cell')",
        name="deployments_only_customer_air_gapped",
    ),
    CheckConstraint(
        "NOT air_gapped OR (NOT telemetry_enabled AND last_check_in_at IS NULL)",
        name="deployments_air_gapped_no_checkin",
    ),
    CheckConstraint("tenant_count >= 0", name="deployments_tenant_count_non_negative"),
)

health_signals = Table(
    "health_signals",
    metadata,
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), primary_key=True),
    Column("at", DateTime(timezone=True), nullable=False),
    Column("version", String(64), nullable=False),
    Column("uptime_pct", Numeric, nullable=False),
    Column("error_rate_pct", Numeric, nullable=False),
    Column("p95_latency_ms", Integer, nullable=False),
    Column("queue_depth", Integer, nullable=False),
    Column("disk_used_pct", Numeric, nullable=False),
    Column("active_users", Integer, nullable=False),
    CheckConstraint("uptime_pct >= 0 AND uptime_pct <= 100", name="health_signals_uptime_range"),
    CheckConstraint("error_rate_pct >= 0 AND error_rate_pct <= 100", name="health_signals_error_rate_range"),
    CheckConstraint("disk_used_pct >= 0 AND disk_used_pct <= 100", name="health_signals_disk_used_range"),
    CheckConstraint("p95_latency_ms >= 0", name="health_signals_latency_non_negative"),
    CheckConstraint("queue_depth >= 0", name="health_signals_queue_non_negative"),
    CheckConstraint("active_users >= 0", name="health_signals_users_non_negative"),
)

deployment_agent_tokens = Table(
    "deployment_agent_tokens",
    metadata,
    Column("deployment_id", String(ID), ForeignKey(deployments.c.id), primary_key=True),
    Column("token_sha256", CHAR(64), nullable=False, unique=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("revoked_at", DateTime(timezone=True), nullable=True),
)


class Deployment(CamelModel):
    id: str
    name: str
    kind: Literal["saas_shared_cell", "saas_dedicated_cell", "self_hosted", "edge"]
    account_id: str | None
    region: Literal["in", "eu", "us", "me", "apac"]
    version: str
    channel: Literal["stable", "lts", "preview"]
    health: Literal["healthy", "degraded", "down", "unknown"]
    last_check_in_at: str | None
    telemetry_enabled: bool
    air_gapped: bool
    extension_ids: list[str]
    tenant_count: int


class HealthSignal(CamelModel):
    deployment_id: str
    at: str
    version: str
    uptime_pct: float
    error_rate_pct: float
    p95_latency_ms: int
    queue_depth: int
    disk_used_pct: float
    active_users: int


class HealthReport(BaseModel):
    """PII-free agent check-in body: `HealthSignal` without `deploymentId` (deployment comes from the bearer token)."""

    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)

    at: Annotated[str, StringConstraints(pattern=_UTC_ISO)]
    version: Annotated[str, StringConstraints(pattern=_SEMVER, max_length=64)]
    uptime_pct: Annotated[float, Field(alias="uptimePct", ge=0, le=100, allow_inf_nan=False)]
    error_rate_pct: Annotated[float, Field(alias="errorRatePct", ge=0, le=100, allow_inf_nan=False)]
    p95_latency_ms: Annotated[int, Field(alias="p95LatencyMs", ge=0)]
    queue_depth: Annotated[int, Field(alias="queueDepth", ge=0)]
    disk_used_pct: Annotated[float, Field(alias="diskUsedPct", ge=0, le=100, allow_inf_nan=False)]
    active_users: Annotated[int, Field(alias="activeUsers", ge=0)]

    @field_validator("at")
    @classmethod
    def _valid_utc(cls, value: str) -> str:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("deployments", deployments, Deployment, "id"),
    ("health_signals", health_signals, HealthSignal, "deployment_id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P06 fleet"])

DEPLOYMENTS = Resource(
    "deployments",
    deployments,
    Deployment,
    "ctl.fleet.read",
    {"kind": "kind", "region": "region", "accountId": "account_id", "health": "health", "channel": "channel"},
)
HEALTH_SIGNALS = Resource(
    "health-signals",
    health_signals,
    HealthSignal,
    "ctl.fleet.read",
    {"deploymentId": "deployment_id"},
    "deployment_id",
)

for resource in (DEPLOYMENTS, HEALTH_SIGNALS):
    mount(router, resource)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def derive_health(report: HealthReport) -> Literal["healthy", "degraded"]:
    if (
        report.uptime_pct < 99
        or report.error_rate_pct >= 2
        or report.p95_latency_ms >= 1500
        or report.disk_used_pct >= 90
    ):
        return "degraded"
    return "healthy"


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    return token if token and " " not in token else None


def _unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", "A valid agent bearer token is required.")


async def _read_bounded(request: Request, limit: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > limit:
                raise ApiError(413, "invalid_request", f"Health report exceeds {limit} bytes.")
        except ValueError:
            pass
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise ApiError(413, "invalid_request", f"Health report exceeds {limit} bytes.")
    return bytes(buf)


@router.post("/agent/health", status_code=204)
async def agent_health_check_in(request: Request) -> Response:
    """Outbound PII-free health check-in authenticated by a per-deployment agent bearer token."""
    token = _bearer_token(request)
    if token is None:
        log.info("agent health check-in deployment=- outcome=unauthorized")
        raise _unauthorized()

    token_hash = hash_token(token)
    async with engine_of(request).connect() as conn:
        found = (
            await conn.execute(
                select(
                    deployment_agent_tokens.c.deployment_id,
                    deployment_agent_tokens.c.revoked_at,
                    deployments.c.air_gapped,
                )
                .join(deployments, deployments.c.id == deployment_agent_tokens.c.deployment_id)
                .where(deployment_agent_tokens.c.token_sha256 == token_hash)
            )
        ).first()
    if found is None or found.revoked_at is not None:
        log.info("agent health check-in deployment=%s outcome=unauthorized", found.deployment_id if found else "-")
        raise _unauthorized()

    deployment_id: str = found.deployment_id
    if found.air_gapped:
        log.info("agent health check-in deployment=%s outcome=air_gapped", deployment_id)
        raise ApiError(403, "forbidden", "Air-gapped deployments do not send health reports.")

    try:
        raw = await _read_bounded(request, MAX_REPORT_BYTES)
    except ApiError:
        log.info("agent health check-in deployment=%s outcome=payload_too_large", deployment_id)
        raise

    try:
        report = HealthReport.model_validate_json(raw)
    except ValidationError as exc:
        log.info("agent health check-in deployment=%s outcome=invalid", deployment_id)
        details = [
            ApiErrorDetail(path=".".join(str(p) for p in err["loc"]), message=str(err["msg"])) for err in exc.errors()
        ]
        raise ApiError(422, "invalid_request", "The health report is not valid.", details) from None

    async with engine_of(request).begin() as conn:
        dep = (
            await conn.execute(
                select(deployments.c.air_gapped, deployments.c.last_check_in_at)
                .where(deployments.c.id == deployment_id)
                .with_for_update()
            )
        ).first()
        if dep is None:
            log.info("agent health check-in deployment=%s outcome=unauthorized", deployment_id)
            raise _unauthorized()
        if dep.air_gapped:
            log.info("agent health check-in deployment=%s outcome=air_gapped", deployment_id)
            raise ApiError(403, "forbidden", "Air-gapped deployments do not send health reports.")
        now = datetime.now(UTC)
        if dep.last_check_in_at is not None and (now - dep.last_check_in_at) < MIN_REPORT_INTERVAL:
            log.info("agent health check-in deployment=%s outcome=rate_limited", deployment_id)
            raise ApiError(429, "rate_limited", "At most one health report per 60 seconds is allowed.")

        signal_row: dict[str, Any] = {
            "deployment_id": deployment_id,
            # A wrong install clock must not put a check-in in the future: never later than the server's time.
            "at": min(datetime.fromisoformat(report.at.replace("Z", "+00:00")), now),
            "version": report.version,
            "uptime_pct": report.uptime_pct,
            "error_rate_pct": report.error_rate_pct,
            "p95_latency_ms": report.p95_latency_ms,
            "queue_depth": report.queue_depth,
            "disk_used_pct": report.disk_used_pct,
            "active_users": report.active_users,
        }
        stmt = pg_insert(health_signals).values(signal_row)
        await conn.execute(
            stmt.on_conflict_do_update(
                index_elements=["deployment_id"],
                set_={k: v for k, v in signal_row.items() if k != "deployment_id"},
            )
        )
        await conn.execute(
            update(deployments)
            .where(deployments.c.id == deployment_id)
            .values(
                version=report.version,
                health=derive_health(report),
                last_check_in_at=now,
                telemetry_enabled=True,
            )
        )

    log.info("agent health check-in deployment=%s outcome=ok", deployment_id)
    return Response(status_code=204)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo deployments and their latest health signals, after accounts."""
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
