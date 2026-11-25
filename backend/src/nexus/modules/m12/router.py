"""Guarded staff admissions endpoints (M12)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy import select

from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m12.models import AdmissionOffer, Enquiry, WaitlistEntry
from nexus.modules.m12.schemas import AdmissionOfferOut, ApplicationOut, EnquiryIn, EnquiryOut, WaitlistEntryOut
from nexus.modules.m12.service import application_page, create_enquiry
from nexus.modules.m15.service import read_page
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m12 admissions"])
Reader = Annotated[Authorized, Depends(require("m12.admissions.read", "M12"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m12.admissions.manage", "M12"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


@router.get("/enquiries")
async def enquiries(auth: Reader, page: Paging, status: str | None = None) -> Page[EnquiryOut]:
    query = select(Enquiry).order_by(Enquiry.list_order, Enquiry.id)
    if status is not None:
        query = query.where(Enquiry.status == status)
    return await read_page(auth.ctx.db, query, EnquiryOut, page)


@router.get("/applications")
async def applications(auth: Reader, page: Paging, cipher: Cipher) -> Page[ApplicationOut]:
    return await application_page(auth.ctx.db, page, cipher)


@router.get("/admission-offers")
async def admission_offers(auth: Reader, page: Paging) -> Page[AdmissionOfferOut]:
    query = select(AdmissionOffer).order_by(AdmissionOffer.list_order, AdmissionOffer.id)
    return await read_page(auth.ctx.db, query, AdmissionOfferOut, page)


@router.get("/waitlist")
async def waitlist(auth: Reader, page: Paging) -> Page[WaitlistEntryOut]:
    query = select(WaitlistEntry).order_by(WaitlistEntry.list_order, WaitlistEntry.id)
    return await read_page(auth.ctx.db, query, WaitlistEntryOut, page)


@router.post(
    "/enquiries",
    status_code=201,
    openapi_extra={
        "requestBody": {"required": True, "content": {"application/json": {"schema": EnquiryIn.model_json_schema()}}}
    },
)
async def post_enquiry(auth: Manager, request: Request) -> EnquiryOut:
    # Parse after both guards and never reflect extra keys or input values in validation details.
    try:
        data = EnquiryIn.model_validate_json(await request.body())
    except ValidationError as exc:
        details = [
            ApiErrorDetail(
                path="" if issue["type"] == "extra_forbidden" else ".".join(map(str, issue["loc"])),
                message="Invalid JSON body" if issue["type"] == "json_invalid" else "Invalid enquiry field",
            )
            for issue in exc.errors(include_input=False)
        ]
        raise ApiError(400, "invalid_request", "The request is not valid.", details) from None
    return await create_enquiry(auth, data)
