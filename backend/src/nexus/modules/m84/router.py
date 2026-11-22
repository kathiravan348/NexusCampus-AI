"""`/api/v1/install/*` (M84, NEX-105) — the shapes of `@nexus/contracts` install.ts, as the mocks serve them.

Institution admins only (`m01.institution.manage`, as the mocks: install administration is institution
administration), on a self-hosted install with M84 on (`403 module_disabled` otherwise). Data comes from the install
agent's `install_status` row: versions and counts, never people (V-7).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import text

from nexus.core.entitlements import ensure_module_enabled
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.request_context import app_settings

router = APIRouter(prefix="/api/v1", tags=["m84 install"])
Admin = Annotated[Authorized, Depends(require("m01.institution.manage", "M01"), scope="function")]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class LicenceSummary(_Camel):
    edition: Literal["standard", "enterprise"]
    state: Literal["active", "grace", "read_only", "expired", "revoked"]
    expires_at: str | None
    support_ends_at: str
    learner_cap: int
    learners_used: int
    campus_cap: int
    campuses_used: int
    grace_ends_at: str | None


class InstallStatus(_Camel):
    install_id: str
    version: str
    channel: Literal["stable", "lts", "preview"]
    licence: LicenceSummary
    air_gapped: bool
    telemetry_enabled: bool
    last_update_check_at: str | None
    last_backup_at: str | None


class UpdateOffer(_Camel):
    version: str
    channel: Literal["stable", "lts", "preview"]
    source: Literal["online", "offline_bundle"]
    signature_valid: bool
    security_fix: bool
    release_notes: str
    covered_by_support: bool


class UpdateOfferResponse(_Camel):
    offer: UpdateOffer | None


class BackupJob(_Camel):
    id: str
    kind: Literal["backup", "tenant_export"]
    status: Literal["running", "done", "failed"]
    encrypted: Literal[True]
    size_bytes: int | None
    started_at: str
    finished_at: str | None


class DiagnosticBundle(_Camel):
    id: str
    status: Literal["generating", "ready_for_review", "approved", "sent", "discarded"]
    scrubbed: Literal[True]
    size_bytes: int | None
    ticket_ref: str | None
    created_at: str
    reviewed_by: str | None
    sent_at: str | None


class DiagnosticContent(_Camel):
    id: str
    content: str


def _utc(value: Any) -> str | None:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ") if value is not None else None


async def _status_row(request: Request, auth: Authorized) -> Any:
    if app_settings(request).install_mode != "self_hosted":
        raise ApiError(403, "module_disabled", "Install & updates exists only on an install on your own servers.")
    await ensure_module_enabled(auth.ctx.db, auth.ctx.tenant.tenant_id, "M84")
    row = (await auth.ctx.db.execute(text("SELECT * FROM install_status WHERE id = 1"))).mappings().first()
    if row is None:
        raise ApiError(503, "internal", "The install agent has not run yet.")
    return row


@router.get("/install/status", response_model=InstallStatus)
async def install_status(request: Request, auth: Admin) -> InstallStatus:
    row = await _status_row(request, auth)
    return InstallStatus(
        install_id=row["install_id"],
        version=row["version"],
        channel=row["channel"],
        licence=LicenceSummary.model_validate(row["licence"]),
        air_gapped=row["air_gapped"],
        telemetry_enabled=row["telemetry_enabled"],
        last_update_check_at=_utc(row["last_update_check_at"]),
        last_backup_at=_utc(row["last_backup_at"]),
    )


@router.get("/install/update", response_model=UpdateOfferResponse)
async def install_update(request: Request, auth: Admin) -> UpdateOfferResponse:
    row = await _status_row(request, auth)
    offer = row["update_offer"]
    return UpdateOfferResponse(offer=UpdateOffer.model_validate(offer) if offer else None)


@router.get("/install/backups", response_model=Page[BackupJob])
async def install_backups(
    request: Request, auth: Admin, page: Annotated[PageQuery, Depends(page_query)]
) -> Page[BackupJob]:
    """Encrypted backups made by the install agent (NEX-112), newest first."""
    await _status_row(request, auth)
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM install_backups"))).scalar_one()
    rows = await db.execute(
        text("SELECT * FROM install_backups ORDER BY started_at DESC LIMIT :n OFFSET :o"),
        {"n": page.page_size, "o": page.offset},
    )
    items = [
        BackupJob(
            id=r["id"],
            kind=r["kind"],
            status=r["status"],
            encrypted=True,
            size_bytes=r["size_bytes"],
            started_at=_utc(r["started_at"]) or "",
            finished_at=_utc(r["finished_at"]),
        )
        for r in rows.mappings()
    ]
    return Page[BackupJob].of(items, int(total), page)


def _bundle(r: Any) -> DiagnosticBundle:
    return DiagnosticBundle(
        id=r["id"],
        status=r["status"],
        scrubbed=True,
        size_bytes=r["size_bytes"],
        ticket_ref=r["ticket_ref"],
        created_at=_utc(r["created_at"]) or "",
        reviewed_by=r["reviewed_by"],
        sent_at=_utc(r["sent_at"]),
    )


@router.get("/install/diagnostics", response_model=Page[DiagnosticBundle])
async def install_diagnostics(
    request: Request, auth: Admin, page: Annotated[PageQuery, Depends(page_query)]
) -> Page[DiagnosticBundle]:
    """Support bundles with personal data removed; nothing leaves the install until an admin approves (V-6)."""
    await _status_row(request, auth)
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM install_diagnostics"))).scalar_one()
    rows = await db.execute(
        text("SELECT * FROM install_diagnostics ORDER BY created_at DESC LIMIT :n OFFSET :o"),
        {"n": page.page_size, "o": page.offset},
    )
    return Page[DiagnosticBundle].of([_bundle(r) for r in rows.mappings()], int(total), page)


async def _one_bundle(request: Request, auth: Authorized, bundle_id: str) -> Any:
    await _status_row(request, auth)
    row = (
        (await auth.ctx.db.execute(text("SELECT * FROM install_diagnostics WHERE id = :id"), {"id": bundle_id}))
        .mappings()
        .first()
    )
    if row is None:
        raise ApiError(404, "not_found", "No such diagnostic bundle.")
    return row


@router.get("/install/diagnostics/{bundle_id}/content", response_model=DiagnosticContent)
async def diagnostic_content(request: Request, auth: Admin, bundle_id: str) -> DiagnosticContent:
    """Exactly what would be sent, for the admin to read before approving."""
    row = await _one_bundle(request, auth, bundle_id)
    folder = app_settings(request).diagnostics_dir or app_settings(request).install_dir / "diagnostics"
    path = (folder / str(row["file_name"])).resolve()
    if path.parent != folder.resolve() or not path.is_file():
        raise ApiError(404, "not_found", "The bundle file is not on this install any more.")
    return DiagnosticContent(id=row["id"], content=path.read_text(encoding="utf-8"))


async def _decide(request: Request, auth: Authorized, bundle_id: str, status: str) -> DiagnosticBundle:
    await _one_bundle(request, auth, bundle_id)
    done = await auth.ctx.db.execute(
        text(
            "UPDATE install_diagnostics SET status = :status, reviewed_by = :by"
            " WHERE id = :id AND status = 'ready_for_review' RETURNING *"
        ),
        {"status": status, "by": auth.ctx.user_id, "id": bundle_id},
    )
    row = done.mappings().first()
    if row is None:
        raise ApiError(409, "conflict", "Only a bundle waiting for review can be approved or discarded.")
    return _bundle(row)


@router.post("/install/diagnostics/{bundle_id}/approve", response_model=DiagnosticBundle)
async def approve_diagnostics(request: Request, auth: Admin, bundle_id: str) -> DiagnosticBundle:
    """The admin read it and allows it to be sent (sending: NEX-113)."""
    return await _decide(request, auth, bundle_id, "approved")


@router.post("/install/diagnostics/{bundle_id}/discard", response_model=DiagnosticBundle)
async def discard_diagnostics(request: Request, auth: Admin, bundle_id: str) -> DiagnosticBundle:
    return await _decide(request, auth, bundle_id, "discarded")
