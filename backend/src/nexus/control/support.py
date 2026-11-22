"""P09 support desk on the control database (NEX-122): tickets, replies, SLA policies, knowledge base.

Reads (`ctl.ticket.read`): partners see only their accounts' tickets and replies (joined through visible tickets, never
by reply id alone), and no SLA policies or KB articles. Write (`POST /tickets/{id}/replies`, `ctl.ticket.reply`) appends
one staff reply and updates ticket status/assignee/resolved_at atomically; logs ids only, never reply text (V-6).
"""

import logging
import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field, StrictBool, StringConstraints
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.accounts import accounts
from nexus.control.resources import CamelModel, Resource, engine_of, mount, not_found
from nexus.control.rows import from_db, to_db
from nexus.control.staff import DocumentNumber, Id, UtcDateTime, metadata, staff_users
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query

ID = 64
_DOC_NUM_RE = r"^[A-Z]{2,5}-[0-9]{4}-[0-9]{3,6}$"
_SLUG_RE = r"^[a-z0-9]+(-[a-z0-9]+)*$"
log = logging.getLogger("nexus.control.support")

tickets = Table(
    "tickets",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("number", String(32), nullable=False, unique=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("subject", String(200), nullable=False),
    Column("summary", String(500), nullable=False),
    Column("priority", String(4), nullable=False),
    Column("status", String(24), nullable=False),
    Column("channel", String(16), nullable=False),
    Column("assignee_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=True, index=True),
    Column("sla_due_at", DateTime(timezone=True), nullable=False),
    Column("breached", Boolean, nullable=False),
    Column("access_request_id", String(ID), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("resolved_at", DateTime(timezone=True), nullable=True),
    CheckConstraint(f"number ~ '{_DOC_NUM_RE}'", name="tickets_number_format"),
    CheckConstraint("length(btrim(subject)) >= 1", name="tickets_subject_non_empty"),
    CheckConstraint("priority IN ('p1', 'p2', 'p3', 'p4')", name="tickets_priority_known"),
    CheckConstraint("status IN ('new', 'open', 'waiting_customer', 'resolved', 'closed')", name="tickets_status_known"),
    CheckConstraint("channel IN ('portal', 'email', 'phone')", name="tickets_channel_known"),
    CheckConstraint(
        "(status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL)", name="tickets_resolved_at_matches_status"
    ),
    CheckConstraint("sla_due_at > created_at", name="tickets_sla_after_created"),
    CheckConstraint("status = 'new' OR assignee_staff_id IS NOT NULL", name="tickets_assignee_past_new"),
)

ticket_replies = Table(
    "ticket_replies",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("ticket_id", String(ID), ForeignKey(tickets.c.id), nullable=False, index=True),
    Column("author_kind", String(16), nullable=False),
    Column("author_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=True),
    Column("body", String(5000), nullable=False),
    Column("internal", Boolean, nullable=False),
    Column("ai_drafted", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint("author_kind IN ('staff', 'customer')", name="ticket_replies_author_kind_known"),
    CheckConstraint("length(btrim(body)) >= 1", name="ticket_replies_body_non_empty"),
    CheckConstraint(
        "(author_kind = 'staff') = (author_staff_id IS NOT NULL)", name="ticket_replies_author_staff_matches_kind"
    ),
    CheckConstraint(
        "author_kind = 'staff' OR (NOT internal AND NOT ai_drafted)", name="ticket_replies_customer_public_human"
    ),
)

sla_policies = Table(
    "sla_policies",
    metadata,
    Column("sla_tier", String(16), primary_key=True),
    Column("first_response_minutes", JSONB, nullable=False),
    Column("resolution_minutes", JSONB, nullable=False),
    Column("twenty_four_seven", Boolean, nullable=False),
    CheckConstraint("sla_tier IN ('standard', 'priority', 'enterprise')", name="sla_policies_tier_known"),
)

kb_articles = Table(
    "kb_articles",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("slug", String(128), nullable=False),
    Column("locale", String(35), nullable=False),
    Column("title", String(200), nullable=False),
    Column("body", Text, nullable=False),
    Column("published", Boolean, nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("locale", "slug", name="uq_kb_articles_locale_slug"),
    CheckConstraint(f"slug ~ '{_SLUG_RE}'", name="kb_articles_slug_format"),
    CheckConstraint("length(btrim(title)) >= 1", name="kb_articles_title_non_empty"),
    CheckConstraint("length(btrim(body)) BETWEEN 1 AND 20000", name="kb_articles_body_length"),
)


class SupportTicket(CamelModel):
    id: Id
    number: DocumentNumber
    account_id: Id
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    summary: Annotated[str, StringConstraints(max_length=500)]
    priority: Literal["p1", "p2", "p3", "p4"]
    status: Literal["new", "open", "waiting_customer", "resolved", "closed"]
    channel: Literal["portal", "email", "phone"]
    assignee_staff_id: Id | None
    sla_due_at: UtcDateTime
    breached: bool
    access_request_id: Id | None
    created_at: UtcDateTime
    resolved_at: UtcDateTime | None


class TicketReply(CamelModel):
    id: Id
    ticket_id: Id
    author_kind: Literal["staff", "customer"]
    author_staff_id: Id | None
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    internal: bool
    ai_drafted: bool
    created_at: UtcDateTime


class SlaMinutes(CamelModel):
    p1: Annotated[int, Field(ge=1)]
    p2: Annotated[int, Field(ge=1)]
    p3: Annotated[int, Field(ge=1)]
    p4: Annotated[int, Field(ge=1)]


class SlaPolicy(CamelModel):
    sla_tier: Literal["standard", "priority", "enterprise"]
    first_response_minutes: SlaMinutes
    resolution_minutes: SlaMinutes
    twenty_four_seven: bool


class KnowledgeArticle(CamelModel):
    id: Id
    slug: Annotated[str, StringConstraints(pattern=_SLUG_RE)]
    locale: Annotated[str, StringConstraints(min_length=2, max_length=35)]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]
    published: bool
    updated_at: UtcDateTime


class NewReply(CamelModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    internal: StrictBool


SEED_TABLES: list[tuple[str, Table, type[CamelModel], str]] = [
    ("tickets", tickets, SupportTicket, "id"),
    ("ticket_replies", ticket_replies, TicketReply, "id"),
    ("sla_policies", sla_policies, SlaPolicy, "sla_tier"),
    ("kb_articles", kb_articles, KnowledgeArticle, "id"),
]

router = APIRouter(prefix="/control/api/v1", tags=["P09 support"])

TICKETS = Resource(
    "tickets",
    tickets,
    SupportTicket,
    "ctl.ticket.read",
    {"accountId": "account_id", "status": "status", "priority": "priority", "assigneeStaffId": "assignee_staff_id"},
    order=tickets.c.created_at.desc(),
)
SLA_POLICIES = Resource("sla-policies", sla_policies, SlaPolicy, "ctl.ticket.read", {}, key="sla_tier")
KB_ARTICLES = Resource(
    "kb-articles", kb_articles, KnowledgeArticle, "ctl.ticket.read", {"locale": "locale", "slug": "slug"}
)

for resource in (TICKETS, SLA_POLICIES, KB_ARTICLES):
    mount(router, resource)


@router.get("/ticket-replies", response_model=Page[TicketReply], name="list_ticket-replies")
async def list_ticket_replies(
    request: Request,
    viewer: Annotated[Viewer, Depends(require("ctl.ticket.read"))],
    pages: Annotated[PageQuery, Depends(page_query)],
) -> Page[TicketReply]:
    """Replies joined through visible tickets, never by reply id alone (partner scoping)."""
    ticket_id = (request.query_params.get("ticketId") or "").strip() or None
    conds: list[Any] = list(TICKETS.scoped(viewer))
    if ticket_id is not None:
        conds.append(ticket_replies.c.ticket_id == ticket_id)
    joined = ticket_replies.join(tickets, ticket_replies.c.ticket_id == tickets.c.id)
    async with engine_of(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(joined).where(*conds))).scalar_one()
        rows = await conn.execute(
            select(ticket_replies)
            .select_from(joined)
            .where(*conds)
            .order_by(ticket_replies.c.created_at, ticket_replies.c.id)
            .limit(pages.page_size)
            .offset(pages.offset)
        )
        items = [TicketReply.model_validate(from_db(ticket_replies, row)) for row in rows.mappings()]
    return Page[TicketReply].of(items, total, pages)


@router.post("/tickets/{ticket_id}/replies", response_model=TicketReply, status_code=201)
async def add_reply(
    request: Request,
    viewer: Annotated[Viewer, Depends(require("ctl.ticket.reply"))],
    ticket_id: str,
    body: NewReply,
) -> TicketReply:
    """Appends a staff reply or internal note and updates ticket status/assignee/resolved_at in one transaction."""
    now = datetime.now(UTC).replace(microsecond=0)
    reply_row: dict[str, Any] = {
        "id": "rep-" + secrets.token_hex(6),
        "ticket_id": ticket_id,
        "author_kind": "staff",
        "author_staff_id": viewer.staff_id,
        "body": body.body,
        "internal": body.internal,
        "ai_drafted": False,
        "created_at": now,
    }
    async with engine_of(request).begin() as conn:
        row = (
            (
                await conn.execute(
                    select(tickets).where(tickets.c.id == ticket_id, *TICKETS.scoped(viewer)).with_for_update()
                )
            )
            .mappings()
            .first()
        )
        if row is None:
            raise not_found()
        cur_status = str(row["status"])
        if cur_status == "closed":
            raise ApiError(409, "conflict", "Closed tickets cannot be replied to.")
        new_status = ("open" if cur_status == "new" else cur_status) if body.internal else "waiting_customer"
        new_assignee = row["assignee_staff_id"] or viewer.staff_id
        new_resolved = row["resolved_at"] if new_status == "resolved" else None
        await conn.execute(
            update(tickets)
            .where(tickets.c.id == ticket_id)
            .values(status=new_status, assignee_staff_id=new_assignee, resolved_at=new_resolved)
        )
        await conn.execute(ticket_replies.insert().values(reply_row))
    log.info("ticket reply ticket=%s reply=%s staff=%s", ticket_id, reply_row["id"], viewer.staff_id)
    return TicketReply.model_validate(from_db(ticket_replies, reply_row))


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts demo support tickets, replies, SLA policies and KB articles, after accounts."""
    count = 0
    for key, table, model, pk in SEED_TABLES:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            conn.execute(
                stmt.on_conflict_do_update(index_elements=[pk], set_={k: v for k, v in row.items() if k != pk})
            )
            count += 1
    return count
