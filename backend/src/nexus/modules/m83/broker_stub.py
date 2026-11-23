"""Dev-only stand-in for the provider access broker (NEX-051; replaced by P10 Nexus Control in Stage 2).

Lets a developer (or a test) act as provider staff: file an access request for a tenant, and fetch a grant
credential once the institution approved it. Mounted only outside `prod` and refused there anyway. It has no
staff sign-in: in Stage 2 the broker authenticates provider staff and the tenant comes from the request record.
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Request
from pydantic import Field, StringConstraints
from sqlalchemy import text

from nexus.core import db
from nexus.core.bodies import Issue, parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.request_context import app_settings
from nexus.core.schemas import Contract
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.modules.m83.access import MAX_GRANT_HOURS, AccessRequestOut, Mode, ModuleId, Text
from nexus.modules.m83.broker_inbox import InboxAccessRequest, file_access_request
from nexus.modules.m83.grant_auth import credential_expiry, signer_of

router = APIRouter(prefix="/api/v1/dev/broker", tags=["m83 dev broker stub"])
JsonBody = Annotated[Any, Body()]
Ref = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,128}$")]


async def dev_only(request: Request) -> None:
    if app_settings(request).environment == "prod":
        raise ApiError(404, "not_found", "Not found.")


dev_only.__nexus_guard__ = (None, "M83")  # type: ignore[attr-defined]  # route walk: dev-only provider stand-in
DevOnly = Annotated[None, Depends(dev_only)]


class FileRequestIn(Contract):
    staff_ref: Ref
    staff_display_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    reason: Text
    modules: list[ModuleId] = Field(min_length=1)
    mode: Mode
    duration_hours: int = Field(ge=1, le=MAX_GRANT_HOURS)


class CredentialIn(Contract):
    staff_ref: Ref


class CredentialOut(Contract):
    credential: str
    expires_at: datetime


def _no_duplicates(raw: dict[str, Any]) -> list[Issue]:
    modules = raw.get("modules")
    if isinstance(modules, list) and len(set(map(str, modules))) != len(modules):
        return [("modules", "modules has duplicates")]
    return []


@router.post("/tenants/{tenant_id}/access-requests", status_code=201, response_model=AccessRequestOut)
async def file_request(tenant_id: str, _: DevOnly, request: Request, body: JsonBody) -> AccessRequestOut:
    data = parse_body(FileRequestIn, body, _no_duplicates)
    ctx = TenantContext(tenant_id)
    req = InboxAccessRequest(
        request_id=new_id("acr"),
        staff_ref=data.staff_ref,
        staff_display_name=data.staff_display_name,
        reason=data.reason,
        modules=data.modules,
        mode=data.mode,
        duration_hours=data.duration_hours,
    )
    async with tenant_transaction(db.sessionmaker(), ctx, app_settings(request)) as session:
        return await file_access_request(session, ctx, req)


@router.post("/tenants/{tenant_id}/access-grants/{grant_id}/credential", response_model=CredentialOut)
async def issue_credential(
    tenant_id: str, grant_id: str, _: DevOnly, request: Request, body: JsonBody
) -> CredentialOut:
    """A short-lived credential for an active grant (404 unknown or not this staff member's; 409 not active)."""
    data = parse_body(CredentialIn, body)
    now = datetime.now(UTC)
    async with tenant_transaction(db.sessionmaker(), TenantContext(tenant_id), app_settings(request)) as session:
        row = (
            (
                await session.execute(
                    text(
                        "SELECT g.ends_at, g.revoked_at, g.starts_at, r.staff_ref FROM access_grants g "
                        "JOIN access_requests r ON r.id = g.request_id WHERE g.id = :id"
                    ),
                    {"id": grant_id},
                )
            )
            .mappings()
            .first()
        )
    if row is None or row["staff_ref"] != data.staff_ref:
        raise ApiError(404, "not_found", "Not found.")
    if row["revoked_at"] is not None or not row["starts_at"] <= now < row["ends_at"]:
        message = "Grant is no longer active"
        raise ApiError(409, "conflict", message, [ApiErrorDetail(path="status", message=message)])
    expires = credential_expiry(row["ends_at"], now)
    credential = signer_of(request).issue(tenant_id, grant_id, data.staff_ref, expires)
    return CredentialOut(credential=credential, expires_at=expires)
