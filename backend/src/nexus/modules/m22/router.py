"""Guarded M22 report card and M23 issued document endpoints (order, errors and scope as `m22.ts`, `m23.ts`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m22.schemas import (
    IssuedDocumentOut,
    IssuedDocumentReadOut,
    ReportCardOut,
    ReportCardStatusIn,
    RevokeIn,
)
from nexus.modules.m22.service import (
    DOCUMENTS_ISSUE,
    REPORTS_PUBLISH,
    card_page,
    change_status,
    document_page,
    revoke,
)
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m22 report cards", "m23 documents"])
ReportsMember = Annotated[Authorized, Depends(require(None, "M22"), scope="function")]
Publisher = Annotated[Authorized, Depends(require(REPORTS_PUBLISH, "M22"), scope="function")]
DocumentsMember = Annotated[Authorized, Depends(require(None, "M23"), scope="function")]
Issuer = Annotated[Authorized, Depends(require(DOCUMENTS_ISSUE, "M23"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]
LearnerId = Annotated[str | None, Query(alias="learnerId")]


def _param(value: str | None) -> str | None:
    return (value or "").strip() or None


@router.get("/report-cards")
async def report_cards(
    auth: ReportsMember,
    page: Paging,
    cipher: Cipher,
    learner_id: LearnerId = None,
    class_group_id: Annotated[str | None, Query(alias="classGroupId")] = None,
) -> Page[ReportCardOut]:
    return await card_page(auth, page, _param(learner_id), _param(class_group_id), cipher)


@router.post(
    "/report-cards/{card_id}/status",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": ReportCardStatusIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def report_card_status(card_id: str, auth: Publisher, request: Request, cipher: Cipher) -> ReportCardOut:
    return await change_status(auth, card_id, await request.body(), cipher)


@router.get("/issued-documents")
async def issued_documents(
    auth: DocumentsMember, page: Paging, cipher: Cipher, learner_id: LearnerId = None
) -> Page[IssuedDocumentReadOut]:
    return await document_page(auth, page, _param(learner_id), cipher)


@router.post(
    "/issued-documents/{document_id}/revoke",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": RevokeIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def revoke_document(document_id: str, auth: Issuer, request: Request, cipher: Cipher) -> IssuedDocumentOut:
    return await revoke(auth, document_id, await request.body(), cipher)
