"""Public admissions enquiry form (M12, D79, D81): no session, unguessable form ids, abuse limits.

Order, as the mock (`m12-public.ts`) plus the limits: rate limit → resolve the form id with the definer function
→ that tenant's RLS transaction → `404 not_found` when the id is unknown, M12 is off, the institution is
suspended, or the tenant cannot be served here (all identical) → body. Nothing reveals a tenant or echoes data.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import insert, select, text
from sqlalchemy.exc import StatementError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core import db
from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.entitlements import module_enabled
from nexus.core.errors import ApiError, ApiErrorDetail, error_response
from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.modules.m01.models import Campus, Institution
from nexus.modules.m12.models import Enquiry
from nexus.modules.m12.ratelimit import GET_LIMITS, POST_LIMITS, Limited, Window, client_ip, limiter_of
from nexus.modules.m12.schemas import PublicEnquiryFormOut, PublicEnquiryIn, PublicEnquiryOption, PublicEnquiryReceipt
from nexus.modules.m15.models import Program
from nexus.modules.m15.service import invalid

router = APIRouter(prefix="/api/v1/public", tags=["m12 public enquiry"])

FORM_ID_MAX = 128


@dataclass(frozen=True)
class PublicForm:
    id: str
    tenant: TenantContext
    institution: Institution


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "This enquiry form was not found.")


async def _limit(request: Request, windows: tuple[Window, ...], form_id: str) -> Response | None:
    try:
        await limiter_of(request).hit(windows, client_ip(request), form_id)
    except Limited as exc:
        response = error_response(
            request,
            429,
            "rate_limited",
            "Too many requests. Please try again later.",
            [ApiErrorDetail(path="", message="Too many requests")],
        )
        response.headers["Retry-After"] = str(exc.retry_after)
        return response
    return None


async def _owner_of(form_id: str) -> tuple[str, str] | None:
    if not form_id or len(form_id) > FORM_ID_MAX or "\x00" in form_id:
        return None
    async with db.sessionmaker()() as session, session.begin():
        row = (
            await session.execute(
                text("SELECT tenant_id, institution_id FROM nexus_public_enquiry_form(:id)"), {"id": form_id}
            )
        ).one_or_none()
    return (row.tenant_id, row.institution_id) if row else None


@asynccontextmanager
async def _form_transaction(
    request: Request, form_id: str, *, write: bool
) -> AsyncIterator[tuple[AsyncSession, PublicForm]]:
    owner = await _owner_of(form_id)
    if owner is None:
        raise _not_found()
    tenant = TenantContext(owner[0])
    try:
        async with tenant_transaction(db.sessionmaker(), tenant, request.app.state.settings, write=write) as session:
            institution = await session.get(Institution, owner[1])
            if (
                institution is None
                or institution.status == "suspended"
                or not await module_enabled(session, tenant.tenant_id, "M12")
            ):
                raise _not_found()
            yield session, PublicForm(form_id, tenant, institution)
    except ApiError as exc:
        # Region, frozen tenant or any refusal of the tenant itself looks the same as an unknown id.
        if exc.code in {"unauthorized", "tenant_frozen"} or exc.status == 503:
            raise _not_found() from None
        raise


@router.get("/enquiry-forms/{form_id}", response_model=PublicEnquiryFormOut)
async def public_form(form_id: str, request: Request) -> Response:
    limited = await _limit(request, GET_LIMITS, form_id)
    if limited is not None:
        return limited
    async with _form_transaction(request, form_id, write=False) as (session, form):
        institution = form.institution
        programs = await session.execute(
            select(Program.id, Program.name)
            .where(Program.institution_id == institution.id, Program.active.is_(True))
            .order_by(Program.created_at, Program.id)
        )
        campuses = await session.execute(
            select(Campus.id, Campus.name)
            .where(Campus.institution_id == institution.id)
            .order_by(Campus.created_at, Campus.id)
        )
        body = PublicEnquiryFormOut(
            id=form.id,
            institution_name=institution.name,
            institution_type=institution.type,  # type: ignore[arg-type]
            default_locale=institution.default_locale,
            supported_locales=list(institution.supported_locales),
            programs=[PublicEnquiryOption(id=row.id, name=row.name) for row in programs],
            campuses=[PublicEnquiryOption(id=row.id, name=row.name) for row in campuses],
        )
    return JSONResponse(body.model_dump(by_alias=True, mode="json"))


def _receipt() -> Response:
    return JSONResponse(PublicEnquiryReceipt().model_dump(by_alias=True), status_code=202)


def _honeypot_filled(raw: Any) -> bool:
    if not isinstance(raw, dict):
        return False
    website = raw.get("website")
    return isinstance(website, str) and len(website) > 0


@router.post(
    "/enquiry-forms/{form_id}/enquiries",
    status_code=202,
    response_model=PublicEnquiryReceipt,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": PublicEnquiryIn.model_json_schema()}},
        }
    },
)
async def public_enquiry(form_id: str, request: Request) -> Response:
    limited = await _limit(request, POST_LIMITS, form_id)
    if limited is not None:
        return limited
    async with _form_transaction(request, form_id, write=True) as (session, form):
        body = await request.body()
        try:
            raw = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            raise ApiError(
                400,
                "invalid_request",
                "The request is not valid.",
                [ApiErrorDetail(path="", message="Invalid JSON body")],
            ) from None
        if _honeypot_filled(raw):
            return _receipt()  # Same body as a stored enquiry; nothing stored, nothing logged.
        try:
            data = PublicEnquiryIn.model_validate_json(body)
        except ValidationError as exc:
            details = [
                ApiErrorDetail(
                    path="" if issue["type"] == "extra_forbidden" else ".".join(map(str, issue["loc"])),
                    message="Invalid enquiry field",
                )
                for issue in exc.errors(include_input=False)
            ]
            raise ApiError(400, "invalid_request", "The request is not valid.", details) from None
        institution_id = form.institution.id
        if data.program_id is not None:
            program = await session.scalar(
                select(Program.id).where(
                    Program.id == data.program_id, Program.institution_id == institution_id, Program.active.is_(True)
                )
            )
            if program is None:
                raise invalid("programId", "Invalid program")
        if data.campus_id is not None:
            campus = await session.scalar(
                select(Campus.id).where(Campus.id == data.campus_id, Campus.institution_id == institution_id)
            )
            if campus is None:
                raise invalid("campusId", "Invalid campus")
        enquiry_id = new_id("enq").replace("_", "-", 1)
        try:
            await session.execute(
                insert(Enquiry).values(
                    id=enquiry_id,
                    tenant_id=form.tenant.tenant_id,
                    institution_id=institution_id,
                    campus_id=data.campus_id,
                    program_id=data.program_id,
                    assigned_staff_profile_id=None,
                    source="public_form",
                    contact_name=data.contact_name,
                    contact_phone=data.contact_phone,
                    contact_email=data.contact_email,
                    learner_name=data.learner_name,
                    follow_up_on=None,
                    campaign_code=None,
                    status="new",
                    lost_reason=None,
                )
            )
            await record_audit(
                session,
                form.tenant,
                AuditInput(
                    action="m12.enquiry.publicReceived",
                    actor_kind="system",
                    target_type="enquiry",
                    target_id=enquiry_id,
                    changes=changes(*(key for key in data.model_dump(by_alias=True) if key != "website")),
                ),
            )
        except StatementError:
            # A failed insert can carry the whole enquiry in its parameters: never echo or log it.
            raise ApiError(500, "internal", "Could not store the enquiry.") from None
    return _receipt()
