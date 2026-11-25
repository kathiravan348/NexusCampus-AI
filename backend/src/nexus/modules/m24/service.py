"""M24 communication in the caller's tenant transaction (visibility, errors and order as `m24.ts`)."""

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, insert, or_, select, update
from sqlalchemy.exc import StatementError
from sqlalchemy.sql.elements import ColumnElement

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.rbac_models import Role, RoleAssignment
from nexus.core.vault import key_name
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m16.service import family_class_groups
from nexus.modules.m24.models import MeetingBooking, MeetingSlot, MessageThread, Notice, ThreadMessage
from nexus.modules.m24.schemas import MeetingBookingOut, NoticeOut, ThreadMessageIn, ThreadMessageOut

NOTICES_PUBLISH, MEETINGS_MANAGE = "m24.notices.publish", "m24.meetings.manage"
SYSTEM_ROLE_KEYS = ("owner", "admin", "teacher", "guardian", "learner")
BODY_FIELD, NOTE_FIELD = "thread_messages.body", "meeting_bookings.note"


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=not isinstance(value, dict))
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored communication data.") from None


async def _audit(auth: Authorized, action: str, target_type: str, target_id: str, field: str) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes(field, sensitive=(field,)),
        ),
    )


def _mine() -> Any:
    return MessageThread.participant_person_ids.any_()


async def thread_of(auth: Authorized, thread_id: str) -> MessageThread:
    thread = await auth.ctx.db.scalar(
        select(MessageThread).where(MessageThread.id == thread_id, auth.ctx.person_id == _mine())
    )
    if thread is None:  # unknown, another tenant's, or a thread the viewer is not part of
        raise not_found()
    return thread


async def message_page(
    auth: Authorized, page: PageQuery, thread_id: str, cipher: FieldCipher
) -> Page[ThreadMessageOut]:
    db = auth.ctx.db
    thread = await thread_of(auth, thread_id)
    query = select(ThreadMessage).where(ThreadMessage.thread_id == thread.id)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(ThreadMessage.list_order, ThreadMessage.id).limit(page.page_size).offset(page.offset)
        )
    ).all()
    items = []
    for row in rows:
        body = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), BODY_FIELD, row.body)
        values = {key: getattr(row, key) for key in ThreadMessageOut.model_fields if key != "body"}
        items.append(stored(ThreadMessageOut, {**values, "body": body}))
    if items:
        await _audit(auth, "m24.threadMessage.sensitiveRead", "messageThread", thread.id, "body")
    return Page.of(items, total or 0, page)


async def send_message(auth: Authorized, thread_id: str, body: bytes, cipher: FieldCipher) -> ThreadMessageOut:
    db = auth.ctx.db
    thread = await thread_of(auth, thread_id)
    if thread.archived:
        raise ApiError(
            409, "conflict", "Thread is archived", [ApiErrorDetail(path="archived", message="Thread is archived")]
        )
    try:
        text_body = ThreadMessageIn.model_validate_json(body).body
    except ValidationError as exc:
        paths = [
            str(issue["loc"][0]) if issue["loc"] and issue["type"] != "extra_forbidden" else "body"
            for issue in exc.errors(include_input=False)
        ]
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path=path, message="Invalid message body") for path in paths],
        ) from None
    tenant, person = auth.ctx.tenant.tenant_id, auth.ctx.person_id
    sealed = await cipher.encrypt(key_name(tenant, "tenant_data"), BODY_FIELD, text_body)
    statement = (
        insert(ThreadMessage)
        .values(
            id=new_id("msg").replace("_", "-", 1),
            tenant_id=tenant,
            thread_id=thread.id,
            sender_person_id=person,
            body=sealed,
            attachment_ids=[],
            read_by_person_ids=[person],
            device_id=None,
        )
        .returning(ThreadMessage)
    )
    try:
        row = (await db.execute(statement)).scalar_one()
    except StatementError:
        raise ApiError(500, "internal", "Could not send the message.") from None
    await db.execute(
        update(MessageThread)
        .where(MessageThread.id == thread.id)
        .values(last_message_at=row.sent_at, updated_at=func.greatest(row.sent_at, MessageThread.updated_at))
        .execution_options(synchronize_session=False)
    )
    values = {key: getattr(row, key) for key in ThreadMessageOut.model_fields if key != "body"}
    message = stored(ThreadMessageOut, {**values, "body": text_body})
    await _audit(auth, "m24.threadMessage.sent", "messageThread", thread.id, "body")
    return message


async def _role_keys(auth: Authorized) -> set[str]:
    """The viewer's system role keys, from role ids `role-<tenant>-<key>` (as the mock's `roleId`)."""
    tenant = auth.ctx.tenant.tenant_id
    prefix = f"role-{tenant.removeprefix('ten-')}-"
    rows = await auth.ctx.db.scalars(
        select(Role.id).where(
            Role.system.is_(True),
            Role.id.in_(select(RoleAssignment.role_id).where(RoleAssignment.user_id == auth.ctx.user_id)),
        )
    )
    return {role.removeprefix(prefix) for role in rows if role.removeprefix(prefix) in SYSTEM_ROLE_KEYS}


async def visible_notices(auth: Authorized) -> list[Notice]:
    """Publishers see every notice; others only published, live notices addressed to them (as `viewerNotices`)."""
    db = auth.ctx.db
    rows = list((await db.scalars(select(Notice).order_by(Notice.list_order, Notice.id))).all())
    if not auth.grants.has(NOTICES_PUBLISH):
        now = datetime.now(UTC)
        groups = await family_class_groups(auth)
        roles = await _role_keys(auth)
        person = auth.ctx.person_id

        def addressed(notice: Notice) -> bool:
            if notice.status != "published" or notice.publish_at > now:
                return False
            if notice.expires_at is not None and notice.expires_at <= now:
                return False
            kind, ids = notice.audience.get("kind"), set(notice.audience.get("ids") or [])
            return (
                kind == "everyone"
                or (kind == "class_groups" and bool(ids & groups))
                or (kind == "roles" and bool(ids & roles))
                or (kind == "people" and person in ids)
            )

        rows = [row for row in rows if addressed(row)]
    return rows


async def notice_page(auth: Authorized, page: PageQuery) -> Page[NoticeOut]:
    rows = await visible_notices(auth)
    window = rows[page.offset : page.offset + page.page_size]
    return Page.of([stored(NoticeOut, row) for row in window], len(rows), page)


async def booking_page(auth: Authorized, page: PageQuery, cipher: FieldCipher) -> Page[MeetingBookingOut]:
    db = auth.ctx.db
    query = select(MeetingBooking)
    person = auth.ctx.person_id
    own_guardian = False
    if not auth.grants.has(MEETINGS_MANAGE):
        profiles = (
            await db.execute(select(RoleProfile.id, RoleProfile.kind).where(RoleProfile.person_id == person))
        ).all()
        own_guardian = any(row.kind == "guardian" for row in profiles)
        staff = [row.id for row in profiles if row.kind == "staff"]
        slots = select(MeetingSlot.id).where(MeetingSlot.staff_profile_id.in_(staff))
        conditions: list[ColumnElement[bool]] = [MeetingBooking.slot_id.in_(slots)]
        if own_guardian:
            conditions.append(MeetingBooking.guardian_person_id == person)
        query = query.where(or_(*conditions))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        await db.scalars(
            query.order_by(MeetingBooking.list_order, MeetingBooking.id).limit(page.page_size).offset(page.offset)
        )
    ).all()
    manager = auth.grants.has(MEETINGS_MANAGE)
    items = []
    for row in rows:
        show = manager or (own_guardian and row.guardian_person_id == person)
        note = None
        if show and row.note is not None:
            note = await cipher.decrypt(key_name(row.tenant_id, "tenant_data"), NOTE_FIELD, row.note)
        values = {key: getattr(row, key) for key in MeetingBookingOut.model_fields if key != "note"}
        items.append(stored(MeetingBookingOut, {**values, "note": note}))
    if any(item.note is not None for item in items):
        await _audit(auth, "m24.meetingBooking.sensitiveRead", "meetingBooking", "meetingBookingList", "note")
    return Page.of(items, total or 0, page)
