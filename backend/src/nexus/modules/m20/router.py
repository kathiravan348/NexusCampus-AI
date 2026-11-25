"""Guarded M20 gradebook endpoints (order, errors and scope as `m20.ts`; marks replay via `Idempotency-Key`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m15.service import read_page
from nexus.modules.m17.schemas import RosterEntryOut
from nexus.modules.m20.models import GradingScheme, Rubric
from nexus.modules.m20.schemas import AssessmentOut, GradingSchemeOut, MarkEntryIn, MarkEntryOut, RubricOut
from nexus.modules.m20.service import (
    ENTER,
    READ,
    assessment_of,
    assessment_page,
    mark_page,
    roster_of,
    save_mark,
    today,
)
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m20 gradebook"])
Reader = Annotated[Authorized, Depends(require(READ, "M20"), scope="function")]
Member = Annotated[Authorized, Depends(require(None, "M20"), scope="function")]
Enterer = Annotated[Authorized, Depends(require(ENTER, "M20"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


@router.get("/grading-schemes")
async def grading_schemes(auth: Reader, page: Paging) -> Page[GradingSchemeOut]:
    query = select(GradingScheme).order_by(GradingScheme.list_order, GradingScheme.id)
    return await read_page(auth.ctx.db, query, GradingSchemeOut, page)


@router.get("/assessments")
async def assessments(
    auth: Reader, page: Paging, class_group_id: Annotated[str | None, Query(alias="classGroupId")] = None
) -> Page[AssessmentOut]:
    return await assessment_page(auth, page, (class_group_id or "").strip() or None)


@router.get("/rubrics")
async def rubrics(auth: Reader, page: Paging) -> Page[RubricOut]:
    return await read_page(auth.ctx.db, select(Rubric).order_by(Rubric.list_order, Rubric.id), RubricOut, page)


@router.get("/assessments/{assessment_id}/roster")
async def roster(assessment_id: str, auth: Reader, page: Paging) -> Page[RosterEntryOut]:
    entries = await roster_of(auth, await assessment_of(auth, assessment_id), today())
    return Page.of(entries[page.offset : page.offset + page.page_size], len(entries), page)


@router.get("/assessments/{assessment_id}/marks")
async def marks(assessment_id: str, auth: Member, page: Paging, cipher: Cipher) -> Page[MarkEntryOut]:
    return await mark_page(auth, page, assessment_id, cipher)


@router.put(
    "/assessments/{assessment_id}/marks/{learner_id}",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": MarkEntryIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def put_mark(
    assessment_id: str, learner_id: str, auth: Enterer, request: Request, cipher: Cipher
) -> MarkEntryOut:
    # The mock's order: module → permission (guard) → active staff profile → assessment → open → body → roster →
    # maximum → rubric.
    return await save_mark(auth, assessment_id, learner_id, await request.body(), cipher)
