"""Guarded M18 fee endpoints (order, errors and family scope as `m18.ts`; payments replay via `Idempotency-Key`)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m15.service import read_page
from nexus.modules.m18.models import Concession, FeeHead, FeePlan, FeeRefund
from nexus.modules.m18.schemas import (
    ConcessionOut,
    FeeHeadOut,
    FeeInvoiceOut,
    FeePaymentIn,
    FeePaymentOut,
    FeePlanOut,
    FeeRefundOut,
)
from nexus.modules.m18.service import (
    MANAGE,
    READ,
    active_staff,
    invoice_page,
    parse_payment,
    payment_page,
    reason_page,
    record_payment,
)
from nexus.modules.m83.keys import cipher_of

router = APIRouter(prefix="/api/v1", tags=["m18 fees"])
Reader = Annotated[Authorized, Depends(require(READ, "M18"), scope="function")]
Member = Annotated[Authorized, Depends(require(None, "M18"), scope="function")]
Manager = Annotated[Authorized, Depends(require(MANAGE, "M18"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


def _param(value: str | None) -> str | None:
    return (value or "").strip() or None


@router.get("/fee-heads")
async def fee_heads(auth: Reader, page: Paging) -> Page[FeeHeadOut]:
    return await read_page(auth.ctx.db, select(FeeHead).order_by(FeeHead.list_order, FeeHead.id), FeeHeadOut, page)


@router.get("/fee-plans")
async def fee_plans(auth: Reader, page: Paging) -> Page[FeePlanOut]:
    return await read_page(auth.ctx.db, select(FeePlan).order_by(FeePlan.list_order, FeePlan.id), FeePlanOut, page)


@router.get("/concessions")
async def concessions(auth: Reader, page: Paging, cipher: Cipher) -> Page[ConcessionOut]:
    return await reason_page(auth, page, Concession, ConcessionOut, cipher)


@router.get("/fee-refunds")
async def fee_refunds(auth: Reader, page: Paging, cipher: Cipher) -> Page[FeeRefundOut]:
    return await reason_page(auth, page, FeeRefund, FeeRefundOut, cipher)


@router.get("/fee-invoices")
async def fee_invoices(
    auth: Member,
    page: Paging,
    learner_id: Annotated[str | None, Query(alias="learnerId")] = None,
    status: str | None = None,
) -> Page[FeeInvoiceOut]:
    return await invoice_page(auth, page, _param(learner_id), _param(status))


@router.get("/fee-payments")
async def fee_payments(
    auth: Member, page: Paging, invoice_id: Annotated[str | None, Query(alias="invoiceId")] = None
) -> Page[FeePaymentOut]:
    return await payment_page(auth, page, _param(invoice_id))


@router.post(
    "/fee-payments",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": FeePaymentIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_fee_payment(auth: Manager, request: Request) -> FeePaymentOut:
    # The mock's order: module → permission (guard) → active staff profile → body → invoices → amount.
    await active_staff(auth)
    return await record_payment(auth, parse_payment(await request.body()))
