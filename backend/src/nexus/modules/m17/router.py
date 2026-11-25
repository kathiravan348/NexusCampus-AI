"""Guarded M17 attendance endpoints (order, errors and masking as `m17.ts`; marks replay via `Idempotency-Key`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m17.schemas import (
    AttendanceMarkIn,
    AttendanceMarkOut,
    AttendanceSessionOut,
    LeaveRequestOut,
    RosterEntryOut,
)
from nexus.modules.m17.service import (
    READ,
    active_staff,
    create_mark,
    leave_page,
    mark_page,
    roster_page,
    session_page,
)
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m17 attendance"])
Reader = Annotated[Authorized, Depends(require(READ, "M17"), scope="function")]
Member = Annotated[Authorized, Depends(require(None, "M17"), scope="function")]
Marker = Annotated[Authorized, Depends(require("m17.attendance.mark", "M17"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


@router.get("/attendance-sessions")
async def attendance_sessions(
    auth: Reader, page: Paging, class_group_id: Annotated[str | None, Query(alias="classGroupId")] = None
) -> Page[AttendanceSessionOut]:
    return await session_page(auth, page, (class_group_id or "").strip() or None)


@router.get("/attendance-sessions/{session_id}/marks")
async def marks(session_id: str, auth: Member, page: Paging, cipher: Cipher) -> Page[AttendanceMarkOut]:
    return await mark_page(auth, page, session_id, cipher)


@router.get("/attendance-sessions/{session_id}/roster")
async def roster(session_id: str, auth: Reader, page: Paging) -> Page[RosterEntryOut]:
    return await roster_page(auth, page, session_id)


@router.post(
    "/attendance-sessions/{session_id}/marks",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": AttendanceMarkIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_mark(session_id: str, auth: Marker, request: Request, cipher: Cipher) -> AttendanceMarkOut:
    # The mock's order: module → permission (guard) → active staff profile → session → open → body → roster.
    staff = await active_staff(auth)
    return await create_mark(auth, session_id, await request.body(), cipher, staff)


@router.get("/leave-requests")
async def leave_requests(auth: Member, page: Paging, cipher: Cipher) -> Page[LeaveRequestOut]:
    return await leave_page(auth, page, cipher)
