"""P07 releases, staged rollouts, and the install agent's online update check (NEX-115).

`GET /releases[/:id]` and `GET /rollouts` read from the control database (`ctl.release.read`; partner viewers see no
rows). `GET /agent/update` uses the per-deployment agent bearer token (`agent_deployment`) and returns the newest
published, signed release eligible for that deployment's channel, version and active/completed rollout rings.
"""

import logging
import time
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Table,
    Text,
    UniqueConstraint,
    any_,
    exists,
    literal,
    select,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.fleet import AgentDeployment, agent_deployment
from nexus.control.resources import CamelModel, Resource, engine_of, mount
from nexus.control.staff import metadata
from nexus.core.errors import ApiError
from nexus.releases.versions import VersionKey, version_key

ID = 64
MIN_UPDATE_INTERVAL_SECONDS = 60.0
_SEMVER_RE = r"^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"

log = logging.getLogger("nexus.control.releases")

releases = Table(
    "releases",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("version", String(64), nullable=False),
    Column("channel", String(16), nullable=False),
    Column("status", String(16), nullable=False),
    Column("published_at", DateTime(timezone=True), nullable=True),
    Column("signed", Boolean, nullable=False),
    Column("offline_bundle", Boolean, nullable=False),
    Column("min_upgrade_from", String(64), nullable=False),
    Column("migration_notes", String(5000), nullable=False),
    Column("notes_ai_drafted", Boolean, nullable=False),
    UniqueConstraint("channel", "version", name="uq_releases_channel_version"),
    CheckConstraint("channel IN ('stable', 'lts', 'preview')", name="releases_channel_known"),
    CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="releases_status_known"),
    CheckConstraint("(status = 'draft') = (published_at IS NULL)", name="releases_draft_no_published_at"),
    CheckConstraint("status = 'draft' OR signed", name="releases_published_must_be_signed"),
    CheckConstraint("channel <> 'preview' OR NOT offline_bundle", name="releases_preview_no_offline_bundle"),
    CheckConstraint(f"version ~ '{_SEMVER_RE}'", name="releases_version_semver"),
    CheckConstraint(f"min_upgrade_from ~ '{_SEMVER_RE}'", name="releases_min_upgrade_semver"),
)

rollouts = Table(
    "rollouts",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("release_id", String(ID), ForeignKey(releases.c.id), nullable=False, index=True),
    Column("ring", SmallInteger, nullable=False),
    Column("deployment_ids", ARRAY(Text), nullable=False),
    Column("status", String(16), nullable=False),
    Column("started_at", DateTime(timezone=True), nullable=True),
    UniqueConstraint("release_id", "ring", name="uq_rollouts_release_ring"),
    CheckConstraint("ring >= 0 AND ring <= 3", name="rollouts_ring_range"),
    CheckConstraint("cardinality(deployment_ids) >= 1", name="rollouts_deployments_non_empty"),
    CheckConstraint("status IN ('pending', 'running', 'done', 'failed', 'rolled_back')", name="rollouts_status_known"),
    CheckConstraint("(status = 'pending') = (started_at IS NULL)", name="rollouts_pending_no_started_at"),
)


class Release(CamelModel):
    id: str
    version: str
    channel: Literal["stable", "lts", "preview"]
    status: Literal["draft", "published", "withdrawn"]
    published_at: str | None
    signed: bool
    offline_bundle: bool
    min_upgrade_from: str
    migration_notes: str
    notes_ai_drafted: bool


class Rollout(CamelModel):
    id: str
    release_id: str
    ring: int
    deployment_ids: list[str]
    status: Literal["pending", "running", "done", "failed", "rolled_back"]
    started_at: str | None


class AgentUpdateOffer(CamelModel):
    release: Release | None


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("releases", releases, Release, "id"),
    ("rollouts", rollouts, Rollout, "id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P07 releases"])

RELEASES = Resource("releases", releases, Release, "ctl.release.read", {"channel": "channel", "status": "status"})
ROLLOUTS = Resource(
    "rollouts", rollouts, Rollout, "ctl.release.read", {"releaseId": "release_id", "status": "status"}, key=None
)

for resource in (RELEASES, ROLLOUTS):
    mount(router, resource)


def _rate_limit_map(request: Request) -> dict[str, float]:
    store: dict[str, float] | None = getattr(request.app.state, "agent_update_checked_at", None)
    if store is None:
        store = {}
        request.app.state.agent_update_checked_at = store
    return store


def select_update_offer(
    candidates: list[Release],
    current_version: str,
    channel: Literal["stable", "lts", "preview"],
) -> Release | None:
    """Picks the newest published, signed release eligible for `current_version` on `channel`."""
    current_key = version_key(current_version)
    best: Release | None = None
    best_key: VersionKey | None = None
    for rel in candidates:
        if rel.status != "published" or not rel.signed or rel.channel != channel:
            continue
        rel_key = version_key(rel.version)
        # Pre-releases (rel_key[1] == 0) are only ever offered on the preview channel.
        if rel_key[1] == 0 and channel != "preview":
            continue
        if rel_key <= current_key:
            continue
        if current_key < version_key(rel.min_upgrade_from):
            continue
        if best_key is None or rel_key > best_key:
            best = rel
            best_key = rel_key
    return best


@router.get("/agent/update", response_model=AgentUpdateOffer, response_model_by_alias=True)
async def agent_update_check(
    request: Request,
    agent: Annotated[AgentDeployment, Depends(agent_deployment)],
) -> AgentUpdateOffer:
    """Outbound online update check authenticated by a per-deployment agent bearer token."""
    if agent.air_gapped:
        log.info("agent update check deployment=%s outcome=air_gapped", agent.id)
        raise ApiError(403, "forbidden", "Air-gapped deployments do not check for updates online.")

    checked = _rate_limit_map(request)
    now = time.monotonic()
    last = checked.get(agent.id)
    if last is not None and (now - last) < MIN_UPDATE_INTERVAL_SECONDS:
        log.info("agent update check deployment=%s outcome=rate_limited", agent.id)
        raise ApiError(429, "rate_limited", "At most one update check per 60 seconds is allowed.")
    checked[agent.id] = now

    has_active_rollout = exists(
        select(1).where(
            rollouts.c.release_id == releases.c.id,
            rollouts.c.status.in_(("running", "done")),
            literal(agent.id) == any_(rollouts.c.deployment_ids),
        )
    )
    async with engine_of(request).connect() as conn:
        rows = await conn.execute(
            select(releases).where(
                releases.c.status == "published",
                releases.c.signed.is_(True),
                releases.c.channel == agent.channel,
                has_active_rollout,
            )
        )
        candidates = [Release.model_validate(RELEASES.parse(row).model_dump()) for row in rows.mappings()]

    offer = select_update_offer(candidates, agent.version, agent.channel)
    log.info("agent update check deployment=%s outcome=%s", agent.id, "offer" if offer else "none")
    return AgentUpdateOffer(release=offer)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo releases and rollouts, after deployments."""
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
