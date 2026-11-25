"""M18 fee operations in the caller's tenant transaction (order, errors and family scope as `m18.ts`)."""

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import Integer, cast, func, insert, or_, select, text, update
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m02.service import family_of
from nexus.modules.m13.models import Learner
from nexus.modules.m18.models import Concession, FeeInvoice, FeePayment, FeeRefund
from nexus.modules.m18.schemas import FeeInvoiceOut, FeePaymentIn, FeePaymentOut

READ, MANAGE = "m18.fees.read", "m18.fees.manage"


def forbidden() -> ApiError:
    return ApiError(403, "forbidden", "You do not have permission to do this.")


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


def stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    try:
        return schema.model_validate(value, from_attributes=not isinstance(value, dict))
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored fee data.") from None


async def _staff_ids(auth: Authorized, *, active_today: bool) -> list[str]:
    query = select(RoleProfile.id).where(RoleProfile.person_id == auth.ctx.person_id, RoleProfile.kind == "staff")
    if active_today:
        today = datetime.now(UTC).date()
        query = query.where(
            RoleProfile.status == "active",
            RoleProfile.effective_from <= today,
            or_(RoleProfile.effective_to.is_(None), RoleProfile.effective_to >= today),
        )
    return list(await auth.ctx.db.scalars(query.order_by(RoleProfile.id)))


async def family_learner_ids(auth: Authorized) -> set[str] | None:
    """`None` with `m18.fees.read`; otherwise the viewer's family learners (staff and empty families: `403`)."""
    if auth.grants.has(READ):
        return None
    if await _staff_ids(auth, active_today=False):
        raise forbidden()
    db = auth.ctx.db
    family = await family_of(db, auth.ctx.person_id)
    ids = set(await db.scalars(select(Learner.id).where(Learner.person_id.in_(family))))
    if not ids:
        raise forbidden()
    return ids


async def _page[Out: BaseModel](
    auth: Authorized, query: Any, order: Any, page: PageQuery, schema: type[Out]
) -> Page[Out]:
    db = auth.ctx.db
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.order_by(*order).limit(page.page_size).offset(page.offset))
    return Page.of([stored(schema, row) for row in rows], total or 0, page)


async def invoice_page(
    auth: Authorized, page: PageQuery, learner_id: str | None, status: str | None
) -> Page[FeeInvoiceOut]:
    family = await family_learner_ids(auth)
    db = auth.ctx.db
    if learner_id is not None and (
        (family is not None and learner_id not in family)
        or await db.scalar(select(Learner.id).where(Learner.id == learner_id)) is None
    ):
        raise not_found()
    query = select(FeeInvoice)
    if family is not None:
        query = query.where(FeeInvoice.learner_id.in_(family))
    if learner_id is not None:
        query = query.where(FeeInvoice.learner_id == learner_id)
    if status is not None:
        query = query.where(FeeInvoice.status == status)
    return await _page(auth, query, (FeeInvoice.list_order, FeeInvoice.id), page, FeeInvoiceOut)


async def payment_page(auth: Authorized, page: PageQuery, invoice_id: str | None) -> Page[FeePaymentOut]:
    family = await family_learner_ids(auth)
    db = auth.ctx.db
    visible = select(FeeInvoice.id)
    if family is not None:
        visible = visible.where(FeeInvoice.learner_id.in_(family))
    if invoice_id is not None and await db.scalar(visible.where(FeeInvoice.id == invoice_id)) is None:
        raise not_found()
    query = select(FeePayment)
    if family is not None:
        # A combined payment shows its total and every invoice id, so all of them must be visible.
        query = query.where(FeePayment.invoice_ids.contained_by(list(await db.scalars(visible))))
    if invoice_id is not None:
        query = query.where(FeePayment.invoice_ids.any_() == invoice_id)
    return await _page(auth, query, (FeePayment.list_order, FeePayment.id), page, FeePaymentOut)


async def _sensitive_read(auth: Authorized, action: str, target_type: str, target_id: str) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes("reason", sensitive=("reason",)),
        ),
    )


async def reason_page[Out: BaseModel](
    auth: Authorized, page: PageQuery, model: type[Concession] | type[FeeRefund], schema: type[Out], cipher: FieldCipher
) -> Page[Out]:
    """Concessions or refunds: reasons decrypted for `m18.fees.read`, one sensitive-read event per page (E-3)."""
    db = auth.ctx.db
    total = await db.scalar(select(func.count()).select_from(model))
    rows = (
        await db.scalars(select(model).order_by(model.list_order, model.id).limit(page.page_size).offset(page.offset))
    ).all()
    field = f"{model.__tablename__}.reason"
    items = []
    for row in rows:
        stored_reason: str = getattr(row, "reason")  # noqa: B009 - Concession or FeeRefund
        reason = await cipher.decrypt(key_name(auth.ctx.tenant.tenant_id, "tenant_data"), field, stored_reason)
        values = {key: getattr(row, key) for key in schema.model_fields if key != "reason"}
        items.append(stored(schema, {**values, "reason": reason}))
    if items:
        noun = "concession" if model is Concession else "feeRefund"
        await _sensitive_read(auth, f"m18.{noun}.sensitiveRead", noun, f"{noun}List")
    return Page.of(items, total or 0, page)


async def active_staff(auth: Authorized) -> None:
    if not await _staff_ids(auth, active_today=True):
        raise forbidden()


def parse_payment(body: bytes) -> FeePaymentIn:
    """`400` with the first key of each issue (unknown keys and bad JSON → `""`), as the mock."""
    try:
        data = FeePaymentIn.model_validate_json(body)
    except ValidationError as exc:
        paths = [
            "" if not issue["loc"] or issue["type"] == "extra_forbidden" else to_camel(str(issue["loc"][0]))
            for issue in exc.errors(include_input=False)
        ]
    else:
        rule = data.rule_path()
        if rule is None:
            return data
        paths = [rule]
    raise ApiError(
        400,
        "invalid_request",
        "The request is not valid.",
        [ApiErrorDetail(path=path, message="Invalid fee payment") for path in paths],
    )


def _bad(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


async def _next_receipt(auth: Authorized) -> str:
    db = auth.ctx.db
    # One receipt sequence per tenant: serialise numbering for concurrent payments in this tenant.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext('m18.receipt:' || :t))"), {"t": auth.ctx.tenant.tenant_id}
    )
    row = (
        await db.execute(
            select(
                func.count(),
                func.max(cast(func.substring(FeePayment.receipt_number, r"^R-(\d{6})$"), Integer)),
            )
        )
    ).one()
    count, highest = int(row[0] or 0), int(row[1] or 0)
    return f"R-{max(count, highest) + 1:06d}"


async def record_payment(auth: Authorized, data: FeePaymentIn) -> FeePaymentOut:
    db = auth.ctx.db
    locked = {
        row.id: row
        for row in await db.scalars(
            select(FeeInvoice).where(FeeInvoice.id.in_(data.invoice_ids)).order_by(FeeInvoice.id).with_for_update()
        )
    }
    invoices: list[FeeInvoice] = []
    for invoice_id in data.invoice_ids:
        invoice = locked.get(invoice_id)
        if invoice is None or invoice.status not in {"issued", "part_paid"}:
            raise _bad("invoiceIds", "Invoice is not open for payment")
        if invoice.currency != data.currency:
            raise _bad("currency", "Currency does not match the selected invoices")
        invoices.append(invoice)
    if data.amount > sum(invoice.total - invoice.paid for invoice in invoices):
        raise _bad("amount", "Amount exceeds remaining balance")
    payer = await db.scalar(select(Learner.person_id).where(Learner.id == invoices[0].learner_id))
    if payer is None:
        raise _bad("invoiceIds", "Invoice learner not found")

    remaining = data.amount
    for invoice in sorted(invoices, key=lambda row: (row.due_on, row.id)):  # oldest due first
        applied = min(invoice.total - invoice.paid, remaining)
        if applied <= 0:
            continue
        remaining -= applied
        paid = invoice.paid + applied
        await db.execute(
            update(FeeInvoice)
            .where(FeeInvoice.id == invoice.id)
            .values(
                paid=paid,
                status="paid" if paid == invoice.total else "part_paid",
                updated_at=func.greatest(func.now(), FeeInvoice.updated_at),
            )
            .execution_options(synchronize_session=False)
        )
        if remaining <= 0:
            break

    statement = (
        insert(FeePayment)
        .values(
            id=new_id("pay").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
            invoice_ids=data.invoice_ids,
            payer_person_id=payer,
            currency=data.currency,
            amount=data.amount,
            method=data.method,
            gateway_reference=None,
            receipt_number=await _next_receipt(auth),
            received_at=data.received_at,
            status="succeeded",
            device_id=data.device_id,
        )
        .returning(FeePayment)
    )
    try:
        payment = stored(FeePaymentOut, (await db.execute(statement)).scalar_one())
    except StatementError:
        raise ApiError(500, "internal", "Could not record the payment.") from None
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m18.feePayment.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="feePayment",
            target_id=payment.id,
            changes=changes(*data.model_dump(by_alias=True)),
        ),
    )
    return payment
