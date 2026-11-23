"""P07 releases, staged rollouts, publish/start writes (NEX-130), and online update checks (NEX-115)."""

import json
import logging
import time
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
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
    func,
    literal,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.fleet import AgentDeployment, agent_deployment, deployments
from nexus.control.resources import CamelModel, Resource, engine_of, mount
from nexus.control.staff import Id, Semver, UtcDateTime, metadata
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.vault import Vault
from nexus.releases.manifest import DEFAULT_KEY, SignedRelease, load_public_keys, public_key_file, verify_release
from nexus.releases.versions import VersionKey, version_key

ID = 64
MIN_UPDATE_INTERVAL_SECONDS = 60.0
_SEMVER_RE = r"^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$"
_AI_REVIEW_MSG = "AI-drafted release notes must be reviewed by a person."
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
    Column("signed_manifest", Text, nullable=True),
    UniqueConstraint("channel", "version", name="uq_releases_channel_version"),
    CheckConstraint("channel IN ('stable', 'lts', 'preview')", name="releases_channel_known"),
    CheckConstraint("status IN ('draft', 'published', 'withdrawn')", name="releases_status_known"),
    CheckConstraint("(status = 'draft') = (published_at IS NULL)", name="releases_draft_no_published_at"),
    CheckConstraint("status = 'draft' OR signed", name="releases_published_must_be_signed"),
    CheckConstraint("signed_manifest IS NULL OR signed", name="releases_signed_manifest_requires_signed"),
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
    id: Id
    version: Semver
    channel: Literal["stable", "lts", "preview"]
    status: Literal["draft", "published", "withdrawn"]
    published_at: UtcDateTime | None
    signed: bool
    offline_bundle: bool
    min_upgrade_from: Semver
    migration_notes: Annotated[str, StringConstraints(max_length=5000)]
    notes_ai_drafted: bool


class Rollout(CamelModel):
    id: Id
    release_id: Id
    ring: Annotated[int, Field(ge=0, le=3)]
    deployment_ids: Annotated[list[Id], Field(min_length=1)]
    status: Literal["pending", "running", "done", "failed", "rolled_back"]
    started_at: UtcDateTime | None


class AgentUpdateOffer(CamelModel):
    release: Release | None
    manifest: dict[str, Any] | None = None


class PublishInput(BaseModel):
    model_config = ConfigDict(populate_by_name=False, extra="forbid", frozen=True, strict=True)
    notes_reviewed: bool | None = Field(default=None, alias="notesReviewed")


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

Manager = Annotated[Viewer, Depends(require("ctl.release.manage"))]


def _rate_limit_map(request: Request) -> dict[str, float]:
    store: dict[str, float] | None = getattr(request.app.state, "agent_update_checked_at", None)
    if store is None:
        store = {}
        request.app.state.agent_update_checked_at = store
    return store


def select_update_offer(
    candidates: list[Release], current_version: str, channel: Literal["stable", "lts", "preview"]
) -> Release | None:
    """Picks the newest published, signed release eligible for `current_version` on `channel`."""
    current_key = version_key(current_version)
    best: Release | None = None
    best_key: VersionKey | None = None
    for rel in candidates:
        if rel.status != "published" or not rel.signed or rel.channel != channel:
            continue
        rel_key = version_key(rel.version)
        if (rel_key[1] == 0 and channel != "preview") or rel_key <= current_key:
            continue
        if current_key < version_key(rel.min_upgrade_from):
            continue
        if best_key is None or rel_key > best_key:
            best, best_key = rel, rel_key
    return best


async def _verify_stored_manifest(vault: Vault, raw_text: str | None, version: str, channel: str) -> bool:
    if not raw_text:
        return False
    try:
        doc = json.loads(raw_text)
        if not isinstance(doc, dict) or not isinstance(doc.get("manifest"), dict):
            return False
        signed = SignedRelease.model_validate(doc)
        keys = load_public_keys(await public_key_file(vault, DEFAULT_KEY))
    except (ValueError, ValidationError, RuntimeError):
        return False
    if verify_release(signed, keys, raw_manifest=doc["manifest"]) is not None:
        return False
    return signed.manifest.version == version and signed.manifest.channel == channel


@router.post("/releases/{release_id}/publish", response_model=Release, response_model_by_alias=True)
async def publish_release(
    release_id: str, request: Request, viewer: Manager, body: PublishInput | None = None
) -> Release:
    """Publishes a draft release after verifying its stored OpenBao-signed manifest."""
    if viewer.account_ids is not None:
        raise ApiError(404, "not_found", "Release not found.")
    req = body or PublishInput()
    vault: Vault = request.app.state.vault
    now = datetime.now(UTC)
    async with engine_of(request).begin() as conn:
        row = (
            (await conn.execute(select(releases).where(releases.c.id == release_id).with_for_update()))
            .mappings()
            .first()
        )
        if row is None:
            log.info("release publish staff=%s release=%s outcome=not_found", viewer.staff_id, release_id)
            raise ApiError(404, "not_found", "Release not found.")
        if row["status"] != "draft":
            log.info("release publish staff=%s release=%s outcome=conflict_not_draft", viewer.staff_id, release_id)
            raise ApiError(409, "conflict", "Only draft releases can be published.")
        if row["notes_ai_drafted"] and req.notes_reviewed is not True:
            log.info("release publish staff=%s release=%s outcome=unreviewed_notes", viewer.staff_id, release_id)
            raise ApiError(
                422, "invalid_request", _AI_REVIEW_MSG, [ApiErrorDetail(path="notesReviewed", message=_AI_REVIEW_MSG)]
            )
        if not await _verify_stored_manifest(vault, row["signed_manifest"], str(row["version"]), str(row["channel"])):
            log.info("release publish staff=%s release=%s outcome=not_signed", viewer.staff_id, release_id)
            raise ApiError(409, "conflict", "Release is not signed.")
        updated = (
            (
                await conn.execute(
                    update(releases)
                    .where(releases.c.id == release_id)
                    .values(status="published", signed=True, published_at=now)
                    .returning(releases)
                )
            )
            .mappings()
            .one()
        )
    log.info("release publish staff=%s release=%s outcome=published", viewer.staff_id, release_id)
    return Release.model_validate(RELEASES.parse(updated).model_dump())


@router.post("/rollouts/{rollout_id}/start", response_model=Rollout, response_model_by_alias=True)
async def start_rollout(rollout_id: str, request: Request, viewer: Manager) -> Rollout:
    """Starts a pending rollout ring once the release is published and every earlier ring is done."""
    if viewer.account_ids is not None:
        raise ApiError(404, "not_found", "Rollout not found.")
    now = datetime.now(UTC)
    async with engine_of(request).begin() as conn:
        row = (
            (await conn.execute(select(rollouts).where(rollouts.c.id == rollout_id).with_for_update()))
            .mappings()
            .first()
        )
        if row is None:
            log.info("rollout start staff=%s rollout=%s outcome=not_found", viewer.staff_id, rollout_id)
            raise ApiError(404, "not_found", "Rollout not found.")
        rel = (
            await conn.execute(select(releases.c.status).where(releases.c.id == row["release_id"]).with_for_update())
        ).first()
        if rel is None or rel.status != "published" or row["status"] != "pending":
            log.info("rollout start staff=%s rollout=%s outcome=conflict_state", viewer.staff_id, rollout_id)
            raise ApiError(409, "conflict", "Rollout cannot be started in its current state.")
        unfinished = int(
            (
                await conn.execute(
                    select(func.count())
                    .select_from(rollouts)
                    .where(
                        rollouts.c.release_id == row["release_id"],
                        rollouts.c.ring < row["ring"],
                        rollouts.c.status != "done",
                    )
                )
            ).scalar_one()
        )
        if unfinished > 0:
            log.info("rollout start staff=%s rollout=%s outcome=conflict_earlier_ring", viewer.staff_id, rollout_id)
            raise ApiError(409, "conflict", "Earlier rollout rings must finish first.")
        updated = (
            (
                await conn.execute(
                    update(rollouts)
                    .where(rollouts.c.id == rollout_id)
                    .values(status="running", started_at=now)
                    .returning(rollouts)
                )
            )
            .mappings()
            .one()
        )
    log.info(
        "rollout start staff=%s rollout=%s release=%s outcome=running", viewer.staff_id, rollout_id, row["release_id"]
    )
    return Rollout.model_validate(ROLLOUTS.parse(updated).model_dump())


async def advance_completed_rollouts(conn: Any, deployment_id: str) -> None:
    """Marks any `running` rollout `done` when all its deployments report the release's version (or newer)."""
    active = (
        await conn.execute(
            select(rollouts.c.id, rollouts.c.release_id, rollouts.c.deployment_ids, releases.c.version)
            .join(releases, releases.c.id == rollouts.c.release_id)
            .where(rollouts.c.status == "running", literal(deployment_id) == any_(rollouts.c.deployment_ids))
            .with_for_update(of=rollouts)
        )
    ).all()
    for rol in active:
        target_key = version_key(str(rol.version))
        dep_ids = list(rol.deployment_ids)
        dep_rows = (
            await conn.execute(select(deployments.c.id, deployments.c.version).where(deployments.c.id.in_(dep_ids)))
        ).all()
        versions = {str(d.id): version_key(str(d.version)) for d in dep_rows}
        if len(versions) == len(set(dep_ids)) and all(versions[d] >= target_key for d in dep_ids):
            await conn.execute(update(rollouts).where(rollouts.c.id == rol.id).values(status="done"))
            log.info("rollout completed rollout=%s release=%s deployment=%s", rol.id, rol.release_id, deployment_id)


@router.get("/agent/update", response_model=AgentUpdateOffer, response_model_by_alias=True)
async def agent_update_check(
    request: Request, agent: Annotated[AgentDeployment, Depends(agent_deployment)]
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
                releases.c.signed_manifest.is_not(None),
                releases.c.channel == agent.channel,
                has_active_rollout,
            )
        )
        candidates: list[Release] = []
        manifests: dict[str, str] = {}
        for row in rows.mappings():
            rel = Release.model_validate(RELEASES.parse(row).model_dump())
            candidates.append(rel)
            manifests[rel.id] = str(row["signed_manifest"])
    offer = select_update_offer(candidates, agent.version, agent.channel)
    log.info("agent update check deployment=%s outcome=%s", agent.id, "offer" if offer else "none")
    return AgentUpdateOffer(release=offer, manifest=json.loads(manifests[offer.id]) if offer else None)


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
