"""Guarded M24 communication endpoints (visibility, errors and order as `m24.ts`; replies replay via
`Idempotency-Key`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m15.service import read_page
from nexus.modules.m24.models import MeetingSlot, MessageThread
from nexus.modules.m24.schemas import (
    MeetingBookingOut,
    MeetingSlotOut,
    MessageThreadOut,
    NoticeOut,
    ThreadMessageIn,
    ThreadMessageOut,
)
from nexus.modules.m24.service import booking_page, message_page, notice_page, send_message
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m24 communication"])
MessagesReader = Annotated[Authorized, Depends(require("m24.messages.read", "M24"), scope="function")]
Sender = Annotated[Authorized, Depends(require("m24.messages.send", "M24"), scope="function")]
NoticesReader = Annotated[Authorized, Depends(require("m24.notices.read", "M24"), scope="function")]
MeetingsReader = Annotated[Authorized, Depends(require("m24.meetings.read", "M24"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


@router.get("/message-threads")
async def message_threads(auth: MessagesReader, page: Paging) -> Page[MessageThreadOut]:
    query = (
        select(MessageThread)
        .where(MessageThread.participant_person_ids.any_() == auth.ctx.person_id)
        .order_by(MessageThread.list_order, MessageThread.id)
    )
    return await read_page(auth.ctx.db, query, MessageThreadOut, page)


@router.get("/message-threads/{thread_id}/messages")
async def thread_messages(thread_id: str, auth: MessagesReader, page: Paging, cipher: Cipher) -> Page[ThreadMessageOut]:
    return await message_page(auth, page, thread_id, cipher)


@router.post(
    "/message-threads/{thread_id}/messages",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": ThreadMessageIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_message(thread_id: str, auth: Sender, request: Request, cipher: Cipher) -> ThreadMessageOut:
    # The mock's order: module → permission (guard) → thread of the viewer → archived → body.
    return await send_message(auth, thread_id, await request.body(), cipher)


@router.get("/notices")
async def notices(auth: NoticesReader, page: Paging) -> Page[NoticeOut]:
    return await notice_page(auth, page)


@router.get("/meeting-slots")
async def meeting_slots(
    auth: MeetingsReader, page: Paging, staff_profile_id: Annotated[str | None, Query(alias="staffProfileId")] = None
) -> Page[MeetingSlotOut]:
    staff = (staff_profile_id or "").strip() or None
    query = select(MeetingSlot)
    if staff is not None:
        known = await auth.ctx.db.scalar(
            select(RoleProfile.id).where(RoleProfile.id == staff, RoleProfile.kind == "staff")
        )
        if known is None:
            raise ApiError(404, "not_found", "Not found.")
        query = query.where(MeetingSlot.staff_profile_id == staff)
    return await read_page(auth.ctx.db, query.order_by(MeetingSlot.list_order, MeetingSlot.id), MeetingSlotOut, page)


@router.get("/meeting-bookings")
async def meeting_bookings(auth: MeetingsReader, page: Paging, cipher: Cipher) -> Page[MeetingBookingOut]:
    return await booking_page(auth, page, cipher)
