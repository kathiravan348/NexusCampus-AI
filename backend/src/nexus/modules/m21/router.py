"""Guarded M21 exam endpoints (order, errors and scope as `m21.ts`; seat plans replay via `Idempotency-Key`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m15.service import read_page
from nexus.modules.m21.models import Exam, ExamPaper, SeatAssignment
from nexus.modules.m21.schemas import (
    ExamOut,
    ExamPaperOut,
    HallTicketOut,
    RevaluationRequestOut,
    SeatAssignmentOut,
)
from nexus.modules.m21.service import MANAGE, READ, found, generate_seat_plan, revaluation_page, ticket_page
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m21 exams"])
Reader = Annotated[Authorized, Depends(require(READ, "M21"), scope="function")]
Member = Annotated[Authorized, Depends(require(None, "M21"), scope="function")]
Manager = Annotated[Authorized, Depends(require(MANAGE, "M21"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


@router.get("/exams")
async def exams(auth: Reader, page: Paging) -> Page[ExamOut]:
    return await read_page(auth.ctx.db, select(Exam).order_by(Exam.list_order, Exam.id), ExamOut, page)


@router.get("/exams/{exam_id}/papers")
async def papers(exam_id: str, auth: Reader, page: Paging) -> Page[ExamPaperOut]:
    exam = await found(auth, Exam, exam_id)
    query = select(ExamPaper).where(ExamPaper.exam_id == exam.id).order_by(ExamPaper.list_order, ExamPaper.id)
    return await read_page(auth.ctx.db, query, ExamPaperOut, page)


@router.get("/exam-papers/{paper_id}/seats")
async def seats(paper_id: str, auth: Reader, page: Paging) -> Page[SeatAssignmentOut]:
    paper = await found(auth, ExamPaper, paper_id)
    query = (
        select(SeatAssignment)
        .where(SeatAssignment.exam_paper_id == paper.id)
        .order_by(SeatAssignment.list_order, SeatAssignment.id)
    )
    return await read_page(auth.ctx.db, query, SeatAssignmentOut, page)


@router.post("/exam-papers/{paper_id}/seat-plan")
async def seat_plan(paper_id: str, auth: Manager) -> Page[SeatAssignmentOut]:
    return await generate_seat_plan(auth, paper_id)


@router.get("/hall-tickets")
async def hall_tickets(
    auth: Member, page: Paging, learner_id: Annotated[str | None, Query(alias="learnerId")] = None
) -> Page[HallTicketOut]:
    return await ticket_page(auth, page, (learner_id or "").strip() or None)


@router.get("/revaluation-requests")
async def revaluation_requests(auth: Member, page: Paging, cipher: Cipher) -> Page[RevaluationRequestOut]:
    return await revaluation_page(auth, page, cipher)
