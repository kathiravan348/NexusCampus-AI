"""P01 Accounts & CRM on the control database (NEX-101): the same shapes as `@nexus/contracts` control/account.ts and
partner.ts. Metadata only (V-7): institution name, type, country, region, tenant ids and counts — never people.

Every list takes the page envelope (D15) and the mock's filters; partner users see only rows of their accounts.
"""

import secrets
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import Field, StringConstraints
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

from nexus.control.resources import CamelModel, Resource, engine_of, get_one, mount
from nexus.control.rows import from_db, to_db
from nexus.control.staff import (
    CountryCode,
    CurrencyCode,
    Email,
    Id,
    InstitutionType,
    IsoDate,
    Name,
    PhoneE164,
    Region,
    UtcDateTime,
    metadata,
    staff_users,
)
from nexus.control.viewer import Viewer, current_viewer, require
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

deal_registrations = Table(
    "deal_registrations",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("partner_id", String(ID), ForeignKey(partners.c.id), nullable=False, index=True),
    Column("account_id", String(ID), ForeignKey(accounts.c.id), nullable=False, index=True),
    Column("status", String(16), nullable=False),
    Column("submitted_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", Date, nullable=False),
    CheckConstraint("status IN ('submitted', 'approved', 'rejected', 'expired')", name="deals_status_known"),
)

commissions = Table(
    "commissions",
    metadata,
    Column("id", String(ID), primary_key=True),
    Column("partner_id", String(ID), ForeignKey(partners.c.id), nullable=False, index=True),
    Column("invoice_id", String(ID), ForeignKey("invoices.id"), nullable=False, index=True),
    Column("amount_minor", BigInteger, nullable=False),
    Column("currency", String(3), nullable=False),
    Column("status", String(16), nullable=False),
    Column("paid_at", DateTime(timezone=True), nullable=True),
    CheckConstraint("amount_minor >= 0", name="commissions_amount_non_negative"),
    CheckConstraint("currency ~ '^[A-Z]{3}$'", name="commissions_currency_iso"),
    CheckConstraint("status IN ('pending', 'payable', 'paid')", name="commissions_status_known"),
    CheckConstraint("(status = 'paid') = (paid_at IS NOT NULL)", name="commissions_paid_at_matches_status"),
)


_Camel = CamelModel


class Partner(_Camel):
    id: Id
    name: Name
    country: CountryCode
    tier: Literal["registered", "silver", "gold"]
    commission_pct: Annotated[float, Field(ge=0, le=50)]
    active: bool
    joined_at: UtcDateTime


class DealRegistration(_Camel):
    id: Id
    partner_id: Id
    account_id: Id
    status: Literal["submitted", "approved", "rejected", "expired"]
    submitted_at: UtcDateTime
    expires_at: IsoDate


class Commission(_Camel):
    id: Id
    partner_id: Id
    invoice_id: Id
    amount_minor: Annotated[int, Field(ge=0)]
    currency: CurrencyCode
    status: Literal["pending", "payable", "paid"]
    paid_at: UtcDateTime | None


class Account(_Camel):
    id: Id
    name: Name
    institution_type: InstitutionType
    country: CountryCode
    region: Region
    delivery_model: Literal["saas_shared", "saas_dedicated", "self_hosted", "hybrid"]
    stage: Literal["lead", "trial", "customer", "churned"]
    owner_staff_id: Id
    partner_id: Id | None
    tenant_ids: list[Id]
    learner_count: Annotated[int, Field(ge=0)]
    health_score: Annotated[int, Field(ge=0, le=100)]
    renewal_date: IsoDate | None
    created_at: UtcDateTime


class AccountContact(_Camel):
    id: Id
    account_id: Id
    name: Name
    work_email: Email
    phone: PhoneE164 | None
    kind: Literal["billing", "technical", "executive", "dpo"]


class Opportunity(_Camel):
    id: Id
    account_id: Id
    title: Name
    stage: Literal["qualify", "proposal", "negotiation", "won", "lost"]
    value_minor: Annotated[int, Field(ge=0)]
    currency: CurrencyCode
    close_date: IsoDate
    owner_staff_id: Id


class Contract(_Camel):
    id: Id
    account_id: Id
    kind: Literal["saas_subscription", "licence_perpetual", "licence_term", "support"]
    start_date: IsoDate
    end_date: IsoDate | None
    auto_renew: bool
    value_minor: Annotated[int, Field(ge=0)]
    currency: CurrencyCode
    sla_tier: Literal["standard", "priority", "enterprise"]
    status: Literal["draft", "active", "ended"]


class AccountNote(_Camel):
    id: Id
    account_id: Id
    author_staff_id: Id
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    created_at: UtcDateTime


class StaffDirectoryEntry(_Camel):
    id: Id
    display_name: Name


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

ACCOUNTS = Resource(
    "accounts",
    accounts,
    Account,
    "ctl.account.read",
    {"stage": "stage", "deliveryModel": "delivery_model", "partnerId": "partner_id", "region": "region"},
    order=accounts.c.name,
)
CONTACTS = Resource(
    "contacts", account_contacts, AccountContact, "ctl.account.read", {"accountId": "account_id", "kind": "kind"}, None
)
OPPORTUNITIES = Resource(
    "opportunities", opportunities, Opportunity, "ctl.account.read", {"accountId": "account_id", "stage": "stage"}
)
NOTES = Resource(
    "notes",
    account_notes,
    AccountNote,
    "ctl.account.read",
    {"accountId": "account_id"},
    None,
    order=account_notes.c.created_at.desc(),
)
CONTRACTS = Resource(
    "contracts",
    contracts,
    Contract,
    "ctl.account.read",
    {"accountId": "account_id", "kind": "kind", "status": "status"},
)
PARTNERS = Resource("partners", partners, Partner, "ctl.partner.read", {}, None, order=partners.c.name)
DEALS = Resource(
    "deals",
    deal_registrations,
    DealRegistration,
    "ctl.deal.read",
    {"partnerId": "partner_id", "accountId": "account_id", "status": "status"},
    None,
)
COMMISSIONS = Resource(
    "commissions",
    commissions,
    Commission,
    "ctl.partner.read",
    {"partnerId": "partner_id", "status": "status"},
    None,
)

for resource in (ACCOUNTS, CONTACTS, OPPORTUNITIES, NOTES, CONTRACTS, PARTNERS, DEALS, COMMISSIONS):
    mount(router, resource)


@router.post("/notes", response_model=AccountNote, status_code=201)
async def add_note(
    request: Request, viewer: Annotated[Viewer, Depends(require("ctl.account.manage"))], body: NewNote
) -> AccountNote:
    await get_one(request, ACCOUNTS, viewer, body.account_id)  # visible to this viewer, else 404
    row = {
        "id": "note-" + secrets.token_hex(8),
        "account_id": body.account_id,
        "author_staff_id": viewer.staff_id,
        "body": body.body,
        "created_at": datetime.now(UTC).replace(microsecond=0),
    }
    async with engine_of(request).begin() as conn:
        await conn.execute(account_notes.insert().values(row))
    return AccountNote.model_validate(from_db(account_notes, row))


@router.get("/staff-directory", response_model=Page[StaffDirectoryEntry])
async def staff_directory(
    request: Request, viewer: Annotated[Viewer, Depends(current_viewer)], pages: Pages
) -> Page[StaffDirectoryEntry]:
    """Colleagues' names for display (owners, note authors); any signed-in staff member."""
    async with engine_of(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(staff_users))).scalar_one()
        rows = await conn.execute(
            select(staff_users.c.id, staff_users.c.display_name)
            .order_by(staff_users.c.id)
            .limit(pages.page_size)
            .offset(pages.offset)
        )
        items = [StaffDirectoryEntry.model_validate({"id": r.id, "displayName": r.display_name}) for r in rows]
    return Page[StaffDirectoryEntry].of(items, total, pages)


def seed_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts the P01 tables from the exported fixtures (camelCase JSON), in foreign-key order."""
    return _upsert_tables(conn, data, SEED_TABLES)


def seed_partner_rows(conn: Any, data: dict[str, list[dict[str, Any]]]) -> int:
    """Upserts P12 deal registrations and commissions, after invoices."""
    return _upsert_tables(
        conn,
        data,
        [("deals", deal_registrations, DealRegistration), ("commissions", commissions, Commission)],
    )


def _upsert_tables(
    conn: Any, data: dict[str, list[dict[str, Any]]], tables: list[tuple[str, Table, type[_Camel]]]
) -> int:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    count = 0
    for key, table, model in tables:
        for raw in data.get(key, []):
            row = to_db(table, model.model_validate(raw).model_dump())
            stmt = pg_insert(table).values(row)
            update = {k: v for k, v in row.items() if k != "id"}
            conn.execute(stmt.on_conflict_do_update(index_elements=["id"], set_=update))
            count += 1
    return count
