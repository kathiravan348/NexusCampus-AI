"""P01 Accounts & CRM on the control database (NEX-101): the same shapes as `@nexus/contracts` control/account.ts and
partner.ts. Metadata only (V-7): institution name, type, country, region, tenant ids and counts — never people.

Every list takes the page envelope (D15) and the mock's filters; partner users see only rows of their accounts.
"""

import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel
from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncEngine

from nexus.control.rows import from_db, to_db
from nexus.control.staff import metadata, staff_users
from nexus.control.viewer import Viewer, current_viewer, require
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query

ID = 64

partners = Table(
    "partners",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("country", String(2), nullable=False),
    Column("tier", String(16), nullable=False),
    Column("commission_pct", Numeric(5, 2), nullable=False),
    Column("active", Boolean, nullable=False),
    Column("joined_at", DateTime(timezone=True), nullable=False),
)

accounts = Table(
    "accounts",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("name", String(200), nullable=False),
    Column("institution_type", String(8), nullable=False),
    Column("country", String(2), nullable=False),
    Column("region", String(8), nullable=False),
    Column("delivery_model", String(16), nullable=False),
    Column("stage", String(16), nullable=False),
    Column("owner_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("partner_id", String(ID), ForeignKey(partners.c.id), nullable=True, index=True),
    Column("tenant_ids", ARRAY(Text), nullable=False),
    Column("learner_count", Integer, nullable=False),
    Column("health_score", Integer, nullable=False),
    Column("renewal_date", Date, nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False),
    CheckConstraint(
        "delivery_model <> 'self_hosted' OR cardinality(tenant_ids) = 0", name="accounts_self_hosted_no_tenants"
    ),
    CheckConstraint("health_score BETWEEN 0 AND 100", name="accounts_health_score_range"),
)

account_contacts = Table(
    "account_contacts",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("name", String(200), nullable=False),
    Column("work_email", String(320), nullable=False),
    Column("phone", String(20), nullable=True),
    Column("kind", String(16), nullable=False),
)

opportunities = Table(
    "opportunities",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("title", String(200), nullable=False),
    Column("stage", String(16), nullable=False),
    Column("value_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("close_date", Date, nullable=False),
    Column("owner_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
)

contracts = Table(
    "contracts",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("kind", String(24), nullable=False),
    Column("start_date", Date, nullable=False),
    Column("end_date", Date, nullable=True),
    Column("auto_renew", Boolean, nullable=False),
    Column("value_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("sla_tier", String(16), nullable=False),
    Column("status", String(8), nullable=False),
    CheckConstraint("(kind = 'licence_perpetual') = (end_date IS NULL)", name="contracts_only_perpetual_without_end"),
)

account_notes = Table(
    "account_notes",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("author_staff_id", String(ID), ForeignKey(staff_users.c.id), nullable=False),
    Column("body", String(2000), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class Partner(_Camel):
    id: str
    name: str
    country: str
    tier: Literal["registered", "silver", "gold"]
    commission_pct: float
    active: bool
    joined_at: str


class Account(_Camel):
    id: str
    name: str
    institution_type: str
    country: str
    region: str
    delivery_model: Literal["saas_shared", "saas_dedicated", "self_hosted", "hybrid"]
    stage: Literal["lead", "trial", "customer", "churned"]
    owner_staff_id: str
    partner_id: str | None
    tenant_ids: list[str]
    learner_count: int
    health_score: int
    renewal_date: str | None
    created_at: str


class AccountContact(_Camel):
    id: str
    account_id: str
    name: str
    work_email: str
    phone: str | None
    kind: Literal["billing", "technical", "executive", "dpo"]


class Opportunity(_Camel):
    id: str
    account_id: str
    title: str
    stage: Literal["qualify", "proposal", "negotiation", "won", "lost"]
    value_minor: int
    currency: str
    close_date: str
    owner_staff_id: str


class Contract(_Camel):
    id: str
    account_id: str
    kind: Literal["saas_subscription", "licence_perpetual", "licence_term", "support"]
    start_date: str
    end_date: str | None
    auto_renew: bool
    value_minor: int
    currency: str
    sla_tier: Literal["standard", "priority", "enterprise"]
    status: Literal["draft", "active", "ended"]


class AccountNote(_Camel):
    id: str
    account_id: str
    author_staff_id: str
    body: str
    created_at: str


class StaffDirectoryEntry(_Camel):
    id: str
    display_name: str


class NewNote(_Camel):
    account_id: Annotated[str, StringConstraints(min_length=1, max_length=ID)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


#: Seed order (foreign keys) and the contract model of each table.
SEED_TABLES: list[tuple[str, Table, type[_Camel]]] = [
    ("partners", partners, Partner),
    ("accounts", accounts, Account),
    ("contacts", account_contacts, AccountContact),
    ("opportunities", opportunities, Opportunity),
    ("contracts", contracts, Contract),
    ("notes", account_notes, AccountNote),
]

router = APIRouter(prefix="/control/api/v1", tags=["P01 accounts"])
Pages = Annotated[PageQuery, Depends(page_query)]


def _engine(request: Request) -> AsyncEngine:
    engine: AsyncEngine | None = request.app.state.engine
    if engine is None:
        raise ApiError(503, "internal", "The control database is not available.")
    return engine


async def _page[M: _Camel](
    request: Request,
    table: Table,
    model: type[M],
    viewer: Viewer,
    pages: PageQuery,
    filters: dict[str, str | None],
    scope: str,
    order: Any,
) -> Page[M]:
    conds = [table.c[col] == value for col, value in filters.items() if value]
    if viewer.account_ids is not None:  # partner users: only rows of their accounts (P12)
        conds.append(table.c[scope].in_(viewer.account_ids))
    async with _engine(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(table).where(*conds))).scalar_one()
        rows = await conn.execute(
            select(table).where(*conds).order_by(order).limit(pages.page_size).offset(pages.offset)
        )
        items = [model.model_validate(from_db(table, r)) for r in rows.mappings()]
    return Page[M].of(items, total, pages)


async def _one[M: _Camel](request: Request, table: Table, model: type[M], viewer: Viewer, key: str, scope: str) -> M:
    conds = [table.c.id == key]
    if viewer.account_ids is not None:
        conds.append(table.c[scope].in_(viewer.account_ids))
    async with _engine(request).connect() as conn:
        row = (await conn.execute(select(table).where(*conds))).mappings().first()
    if row is None:
        raise ApiError(404, "not_found", "Not found.")
    return model.model_validate(from_db(table, row))


AccountReader = Annotated[Viewer, Depends(require("ctl.account.read"))]
Q = Annotated[str | None, Query()]


@router.get("/accounts", response_model=Page[Account])
async def list_accounts(
    request: Request,
    viewer: AccountReader,
    pages: Pages,
    stage: Q = None,
    delivery_model: Annotated[str | None, Query(alias="deliveryModel")] = None,
    partner_id: Annotated[str | None, Query(alias="partnerId")] = None,
    region: Q = None,
) -> Page[Account]:
    filters = {"stage": stage, "delivery_model": delivery_model, "partner_id": partner_id, "region": region}
    return await _page(request, accounts, Account, viewer, pages, filters, "id", accounts.c.name)


@router.get("/accounts/{account_id}", response_model=Account)
async def get_account(request: Request, viewer: AccountReader, account_id: str) -> Account:
    return await _one(request, accounts, Account, viewer, account_id, "id")


@router.get("/contacts", response_model=Page[AccountContact])
async def list_contacts(
    request: Request,
    viewer: AccountReader,
    pages: Pages,
    account_id: Annotated[str | None, Query(alias="accountId")] = None,
    kind: Q = None,
) -> Page[AccountContact]:
    filters = {"account_id": account_id, "kind": kind}
    return await _page(
        request, account_contacts, AccountContact, viewer, pages, filters, "account_id", account_contacts.c.id
    )


@router.get("/opportunities", response_model=Page[Opportunity])
async def list_opportunities(
    request: Request,
    viewer: AccountReader,
    pages: Pages,
    account_id: Annotated[str | None, Query(alias="accountId")] = None,
    stage: Q = None,
) -> Page[Opportunity]:
    filters = {"account_id": account_id, "stage": stage}
    return await _page(request, opportunities, Opportunity, viewer, pages, filters, "account_id", opportunities.c.id)


@router.get("/opportunities/{opportunity_id}", response_model=Opportunity)
async def get_opportunity(request: Request, viewer: AccountReader, opportunity_id: str) -> Opportunity:
    return await _one(request, opportunities, Opportunity, viewer, opportunity_id, "account_id")


@router.get("/contracts", response_model=Page[Contract])
async def list_contracts(
    request: Request,
    viewer: AccountReader,
    pages: Pages,
    account_id: Annotated[str | None, Query(alias="accountId")] = None,
    kind: Q = None,
    status: Q = None,
) -> Page[Contract]:
    filters = {"account_id": account_id, "kind": kind, "status": status}
    return await _page(request, contracts, Contract, viewer, pages, filters, "account_id", contracts.c.id)


@router.get("/contracts/{contract_id}", response_model=Contract)
async def get_contract(request: Request, viewer: AccountReader, contract_id: str) -> Contract:
    return await _one(request, contracts, Contract, viewer, contract_id, "account_id")


@router.get("/notes", response_model=Page[AccountNote])
async def list_notes(
    request: Request,
    viewer: AccountReader,
    pages: Pages,
    account_id: Annotated[str | None, Query(alias="accountId")] = None,
) -> Page[AccountNote]:
    order = account_notes.c.created_at.desc()
    filters = {"account_id": account_id}
    return await _page(request, account_notes, AccountNote, viewer, pages, filters, "account_id", order)


@router.post("/notes", response_model=AccountNote, status_code=201)
async def add_note(
    request: Request, viewer: Annotated[Viewer, Depends(require("ctl.account.manage"))], body: NewNote
) -> AccountNote:
    await _one(request, accounts, Account, viewer, body.account_id, "id")  # visible to this viewer, else 404
    row = {
        "id": "note-" + secrets.token_hex(8),
        "account_id": body.account_id,
        "author_staff_id": viewer.staff_id,
        "body": body.body,
        "created_at": datetime.now(UTC).replace(microsecond=0),
    }
    async with _engine(request).begin() as conn:
        await conn.execute(account_notes.insert().values(row))
    return AccountNote.model_validate(from_db(account_notes, row))


@router.get("/staff-directory", response_model=Page[StaffDirectoryEntry])
async def staff_directory(
    request: Request, viewer: Annotated[Viewer, Depends(current_viewer)], pages: Pages
) -> Page[StaffDirectoryEntry]:
    """Colleagues' names for display (owners, note authors); any signed-in staff member."""
    async with _engine(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(staff_users))).scalar_one()
        rows = await conn.execute(
            select(staff_users.c.id, staff_users.c.display_name)
            .order_by(staff_users.c.id)
            .limit(pages.page_size)
            .offset(pages.offset)
        )
        items = [StaffDirectoryEntry(id=r.id, display_name=r.display_name) for r in rows]
    return Page[StaffDirectoryEntry].of(items, total, pages)


@router.get("/partners", response_model=Page[Partner])
async def list_partners(
    request: Request, viewer: Annotated[Viewer, Depends(require("ctl.partner.read"))], pages: Pages
) -> Page[Partner]:
    async with _engine(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(partners))).scalar_one()
        rows = await conn.execute(
            select(partners).order_by(partners.c.name).limit(pages.page_size).offset(pages.offset)
        )
        items = [Partner.model_validate(from_db(partners, r)) for r in rows.mappings()]
    return Page[Partner].of(items, total, pages)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts the P01 tables from the exported fixtures (camelCase JSON), in foreign-key order."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    count = 0
    for key, table, model in SEED_TABLES:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            update = {k: v for k, v in row.items() if k != "id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=["id"], set_=update))
            count += 1
    return count
