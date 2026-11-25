"""Guarded M19 accounting endpoints (order and errors as `m19.ts`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import insert, select
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m01.models import Institution
from nexus.modules.m15.service import read_page
from nexus.modules.m19.models import Budget, JournalEntry, LedgerAccount
from nexus.modules.m19.schemas import BudgetOut, JournalEntryIn, JournalEntryOut, LedgerAccountOut, balanced

router = APIRouter(prefix="/api/v1", tags=["m19 accounting"])
Reader = Annotated[Authorized, Depends(require("m19.accounts.read", "M19"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m19.accounts.manage", "M19"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
ENTRY_KEYS = [to_camel(name) for name in JournalEntryIn.model_fields]


def _bad(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


@router.get("/ledger-accounts")
async def ledger_accounts(auth: Reader, page: Paging) -> Page[LedgerAccountOut]:
    query = select(LedgerAccount).order_by(LedgerAccount.list_order, LedgerAccount.id)
    return await read_page(auth.ctx.db, query, LedgerAccountOut, page)


@router.get("/journal-entries")
async def journal_entries(auth: Reader, page: Paging) -> Page[JournalEntryOut]:
    # The mock prepends new entries: newest first.
    query = select(JournalEntry).order_by(JournalEntry.list_order.desc(), JournalEntry.id)
    return await read_page(auth.ctx.db, query, JournalEntryOut, page)


@router.get("/budgets")
async def budgets(auth: Reader, page: Paging) -> Page[BudgetOut]:
    return await read_page(auth.ctx.db, select(Budget).order_by(Budget.list_order, Budget.id), BudgetOut, page)


def parse_entry(body: bytes) -> JournalEntryIn:
    """`400` with input keys in contract order; the balance rule runs only when every field parsed (as Zod)."""
    try:
        data = JournalEntryIn.model_validate_json(body)
    except ValidationError as exc:
        paths = {str(issue["loc"][0]) for issue in exc.errors(include_input=False) if issue["loc"]}
        failed = [key for key in ENTRY_KEYS if key in paths]
    else:
        if balanced(data.lines):
            return data
        failed = ["lines"]
    details = [ApiErrorDetail(path=key, message="Invalid journal entry field") for key in failed]
    raise ApiError(400, "invalid_request", "The request is not valid.", details or None)


@router.post(
    "/journal-entries",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": JournalEntryIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_journal_entry(auth: Manager, request: Request) -> JournalEntryOut:
    # Module and permission (guard) before the body.
    data = parse_entry(await request.body())
    db = auth.ctx.db
    if await db.scalar(select(Institution.id).where(Institution.id == data.institution_id)) is None:
        raise _bad("institutionId", "Invalid institution")
    wanted = {line.account_id for line in data.lines}
    active = set(
        await db.scalars(
            select(LedgerAccount.id).where(
                LedgerAccount.id.in_(wanted),
                LedgerAccount.active.is_(True),
                LedgerAccount.institution_id == data.institution_id,
            )
        )
    )
    if active != wanted:
        raise _bad("lines", "Choose active accounts for the selected institution")
    statement = (
        insert(JournalEntry)
        .values(
            institution_id=data.institution_id,
            posted_on=data.posted_on,
            reference=data.reference,
            currency=data.currency,
            lines=[line.model_dump(by_alias=True) for line in data.lines],
            id=new_id("je").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
            source="manual",
        )
        .returning(JournalEntry)
    )
    try:
        entry = JournalEntryOut.model_validate((await db.execute(statement)).scalar_one(), from_attributes=True)
    except (StatementError, ValidationError):
        raise ApiError(500, "internal", "Could not post the journal entry.") from None
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m19.journalEntry.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="journalEntry",
            target_id=entry.id,
            changes=changes(*ENTRY_KEYS),
        ),
    )
    return entry
