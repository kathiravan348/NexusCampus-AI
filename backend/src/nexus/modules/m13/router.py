"""Tenant-scoped learner record reads (M13)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m02.service import not_found
from nexus.modules.m13.models import Enrolment, Learner, LearnerDocument
from nexus.modules.m13.schemas import EnrolmentOut, LearnerDocumentOut, LearnerOut
from nexus.modules.m13.service import LearnerAccess, learner_access, learner_records, require_visible_id
from nexus.modules.m15.service import read_page
from nexus.modules.m83.keys import cipher_of

guard = Depends(require(None, "M13"), scope="function")
router = APIRouter(prefix="/api/v1/learners", tags=["m13 learner records"], dependencies=[guard])
Viewer = Annotated[Authorized, guard]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


async def visible_learners(auth: Viewer) -> LearnerAccess:
    return await learner_access(auth)


Access = Annotated[LearnerAccess, Depends(visible_learners, scope="function")]


async def visible_id(id: str, access: Access) -> str:
    await require_visible_id(access, id)
    return id


VisibleId = Annotated[str, Depends(visible_id, scope="function")]


@router.get("")
async def learners(access: Access, page: Paging, cipher: Cipher) -> Page[LearnerOut]:
    db = access.auth.ctx.db
    total = await db.scalar(select(func.count()).select_from(access.query.subquery()))
    rows = await db.scalars(access.query.order_by(Learner.id).limit(page.page_size).offset(page.offset))
    items = await learner_records(access, rows.all(), cipher, "learnerList")
    return Page.of(items, total or 0, page)


@router.get("/{id}")
async def learner(id: str, access: Access, cipher: Cipher) -> LearnerOut:
    row = await access.auth.ctx.db.scalar(access.query.where(Learner.id == id))
    if row is None:
        raise not_found()
    return (await learner_records(access, [row], cipher, id))[0]


@router.get("/{id}/enrolments")
async def enrolments(learner_id: VisibleId, auth: Viewer, page: Paging) -> Page[EnrolmentOut]:
    query = select(Enrolment).where(Enrolment.learner_id == learner_id).order_by(Enrolment.id)
    return await read_page(auth.ctx.db, query, EnrolmentOut, page)


@router.get("/{id}/documents")
async def documents(learner_id: VisibleId, auth: Viewer, page: Paging) -> Page[LearnerDocumentOut]:
    query = select(LearnerDocument).where(LearnerDocument.learner_id == learner_id).order_by(LearnerDocument.id)
    return await read_page(auth.ctx.db, query, LearnerDocumentOut, page)
