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


class DiagnosticBundle(_Camel):
    id: str


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
    """Encrypted backups arrive with NEX-112; until then the list is empty."""
    await _status_row(request, auth)
    return Page[BackupJob].of([], 0, page)


@router.get("/install/diagnostics", response_model=Page[DiagnosticBundle])
async def install_diagnostics(
    request: Request, auth: Admin, page: Annotated[PageQuery, Depends(page_query)]
) -> Page[DiagnosticBundle]:
    """Diagnostic bundles arrive with NEX-112; until then the list is empty."""
    await _status_row(request, auth)
    return Page[DiagnosticBundle].of([], 0, page)
