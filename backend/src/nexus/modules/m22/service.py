"""M22 report cards and M23 issued documents in the caller's tenant transaction (as `m22.ts`, `m23.ts`)."""

import json
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select, update

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m13.models import Enrolment, Learner
from nexus.modules.m15.models import ClassGroup
from nexus.modules.m18.service import family_learner_ids
from nexus.modules.m22.models import IssuedDocument, ReportCard
from nexus.modules.m22.schemas import (
    IssuedDocumentOut,
    IssuedDocumentReadOut,
    ReportCardOut,
    ReportCardStatusIn,
    RevokeIn,
)

REPORTS_READ, REPORTS_PUBLISH = "m22.reports.read", "m22.reports.publish"
DOCUMENTS_READ, DOCUMENTS_ISSUE = "m23.documents.read", "m23.documents.issue"
PREVIOUS = {"approved": "draft", "published": "approved", "withdrawn": "published"}


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: dict[str, Any]) -> Out:
    try:
        return schema.model_validate(value)
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored record.") from None


def _key(tenant: str) -> str:
    return key_name(tenant, "tenant_data")


async def _audit(
    auth: Authorized, action: str, target_type: str, target_id: str, field: str, *, sensitive: bool
) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes(field, sensitive=(field,) if sensitive else ()),
        ),
    )


async def _learner_filter(auth: Authorized, family: set[str] | None, learner_id: str | None) -> None:
    if learner_id is None:
        return
    exists = await auth.ctx.db.scalar(select(Learner.id).where(Learner.id == learner_id))
    if exists is None or (family is not None and learner_id not in family):
        raise not_found()


async def card_view(row: ReportCard, cipher: FieldCipher) -> ReportCardOut:
    remarks: list[str | None] = [None] * len(row.lines)
    if row.line_remarks is not None:
        remarks = json.loads(await cipher.decrypt(_key(row.tenant_id), "report_cards.line_remarks", row.line_remarks))
    overall = None
    if row.overall_remark is not None:
        overall = await cipher.decrypt(_key(row.tenant_id), "report_cards.overall_remark", row.overall_remark)
    lines = [
        {**line, "remark": remarks[index] if index < len(remarks) else None} for index, line in enumerate(row.lines)
    ]
    values = {key: getattr(row, key) for key in ReportCardOut.model_fields if key not in {"lines", "overall_remark"}}
    return stored(ReportCardOut, {**values, "lines": lines, "overall_remark": overall})


def _has_remark(card: ReportCardOut) -> bool:
    return card.overall_remark is not None or any(line.remark is not None for line in card.lines)


async def card_page(
    auth: Authorized, page: PageQuery, learner_id: str | None, class_group_id: str | None, cipher: FieldCipher
) -> Page[ReportCardOut]:
    db = auth.ctx.db
    family = await family_learner_ids(auth, read_permission=REPORTS_READ)
    await _learner_filter(auth, family, learner_id)
    query = select(ReportCard)
    if family is not None:
        query = query.where(ReportCard.learner_id.in_(family), ReportCard.status == "published")
    elif class_group_id is not None:
        group = await db.get(ClassGroup, class_group_id)
        if group is None:
            raise not_found()
        members = select(Enrolment.learner_id).where(Enrolment.class_group_id == group.id)
        query = query.where(ReportCard.academic_year_id == group.academic_year_id, ReportCard.learner_id.in_(members))
    if learner_id is not None:
        query = query.where(ReportCard.learner_id == learner_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(query.order_by(ReportCard.list_order, ReportCard.id).limit(page.page_size).offset(page.offset))
    ).all()
    items = [await card_view(row, cipher) for row in rows]
    if any(_has_remark(item) for item in items):
        await _audit(auth, "m22.reportCard.sensitiveRead", "reportCard", "reportCardList", "remark", sensitive=True)
    return Page.of(items, total or 0, page)


async def change_status(auth: Authorized, card_id: str, body: bytes, cipher: FieldCipher) -> ReportCardOut:
    db = auth.ctx.db
    card = await db.get(ReportCard, card_id)
    if card is None:
        raise not_found()
    try:
        wanted = ReportCardStatusIn.model_validate_json(body).status
    except ValidationError:
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="status", message="Invalid status")],
        ) from None
    if card.status != PREVIOUS[wanted]:
        raise ApiError(
            409, "conflict", "Invalid transition", [ApiErrorDetail(path="status", message="Invalid transition")]
        )
    await db.execute(
        update(ReportCard)
        .where(ReportCard.id == card.id)
        .values(
            status=wanted,
            published_at=func.now() if wanted == "published" else None,
            updated_at=func.greatest(func.now(), ReportCard.updated_at),
        )
        .execution_options(synchronize_session=False)
    )
    await db.refresh(card)
    await _audit(auth, "m22.reportCard.statusChanged", "reportCard", card.id, "status", sensitive=False)
    return await card_view(card, cipher)


async def _document_view(row: IssuedDocument, cipher: FieldCipher, show_reason: bool) -> dict[str, Any]:
    reason = None
    if show_reason and row.revoked_reason is not None:
        reason = await cipher.decrypt(_key(row.tenant_id), "issued_documents.revoked_reason", row.revoked_reason)
    values = {key: getattr(row, key) for key in IssuedDocumentReadOut.model_fields if key != "revoked_reason"}
    return {**values, "revoked_reason": reason}


async def document_page(
    auth: Authorized, page: PageQuery, learner_id: str | None, cipher: FieldCipher
) -> Page[IssuedDocumentReadOut]:
    db = auth.ctx.db
    family = await family_learner_ids(auth, read_permission=DOCUMENTS_READ)
    await _learner_filter(auth, family, learner_id)
    query = select(IssuedDocument)
    if family is not None:
        query = query.where(IssuedDocument.learner_id.in_(family))
    if learner_id is not None:
        query = query.where(IssuedDocument.learner_id == learner_id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(IssuedDocument.list_order, IssuedDocument.id).limit(page.page_size).offset(page.offset)
        )
    ).all()
    items = [stored(IssuedDocumentReadOut, await _document_view(row, cipher, family is None)) for row in rows]
    if any(item.revoked_reason is not None for item in items):
        await _audit(
            auth,
            "m23.issuedDocument.sensitiveRead",
            "issuedDocument",
            "issuedDocumentList",
            "revokedReason",
            sensitive=True,
        )
    return Page.of(items, total or 0, page)


async def revoke(auth: Authorized, document_id: str, body: bytes, cipher: FieldCipher) -> IssuedDocumentOut:
    db = auth.ctx.db
    document = await db.get(IssuedDocument, document_id)
    if document is None:
        raise not_found()
    if document.revoked:
        raise ApiError(409, "conflict", "conflict", [ApiErrorDetail(path="revoked", message="conflict")])
    try:
        reason = RevokeIn.model_validate_json(body).reason
    except ValidationError:
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="reason", message="invalid_request")],
        ) from None
    sealed = await cipher.encrypt(_key(document.tenant_id), "issued_documents.revoked_reason", reason)
    await db.execute(
        update(IssuedDocument)
        .where(IssuedDocument.id == document.id)
        .values(revoked=True, revoked_reason=sealed)
        .execution_options(synchronize_session=False)
    )
    await db.refresh(document)
    await _audit(auth, "m23.issuedDocument.revoked", "issuedDocument", document.id, "reason", sensitive=True)
    values = await _document_view(document, cipher, show_reason=False)
    return stored(IssuedDocumentOut, {**values, "revoked_reason": reason})
