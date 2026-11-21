"""M06 Audit & privacy API (NEX-052): audit log, consents, data subject requests, compliance packs.

Same filters, bodies, errors and audit actions as the mock (`handlers/m06.ts`). Reading the audit log is itself
audited (`m06.auditLog.viewed`, after the page is read, so a page never contains its own read).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, Request
from sqlalchemy import text

from nexus.core.audit import AuditInput, record_audit
from nexus.core.bodies import parse_body
from nexus.core.checkpoints import list_checkpoints, verify_checkpoints
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m02.service import family_of
from nexus.modules.m06.packs import CompliancePackOut, packs_for
from nexus.modules.m06.schemas import (
    AuditCheckpointCheckOut,
    AuditCheckpointOut,
    AuditEventOut,
    AuditVerificationOut,
    ConsentOut,
    DataSubjectRequestOut,
    DsrUpdateIn,
)
from nexus.modules.m06.service import (
    AUDIT_SELECT,
    DSR_SELECT,
    audit_filter,
    dsr_out,
    instant,
    move_request,
    pack_codes,
    step_issue,
)

router = APIRouter(prefix="/api/v1", tags=["m06 audit & privacy"])
AuditReader = Annotated[Authorized, Depends(require("m06.audit.read", "M06"), scope="function")]
ConsentReader = Annotated[Authorized, Depends(require("m06.consent.manage", "M06"), scope="function")]
#: Data subject requests are restricted data (G-6): the catalogue's sensitive `m06.request.manage`.
DsrManager = Annotated[Authorized, Depends(require("m06.request.manage", "M06"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
_CONSENTS = (
    "SELECT id, tenant_id, person_id, purpose, status, given_by_person_id, method, recorded_at, withdrawn_at "
    "FROM consents"
)


@router.get("/audit-events", response_model=Page[AuditEventOut])
async def audit_events(
    auth: AuditReader,
    page: Paging,
    action: Annotated[str | None, Query()] = None,
    actor_id: Annotated[str | None, Query(alias="actorId")] = None,
    grant_id: Annotated[str | None, Query(alias="grantId")] = None,
    since: Annotated[str | None, Query(alias="from")] = None,
    until: Annotated[str | None, Query(alias="to")] = None,
) -> Page[AuditEventOut]:
    """Exact `action` / `actorId` / `grantId`; `from` / `to` inclusive on `occurredAt`; chain order."""
    where, params = audit_filter(action, actor_id, grant_id, instant(since, "from"), instant(until, "to"))
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM audit_events" + where), params)).scalar_one()  # noqa: S608
    rows = (
        (
            await db.execute(
                text(AUDIT_SELECT + where + " ORDER BY seq LIMIT :n OFFSET :o"),
                {**params, "n": page.page_size, "o": page.offset},
            )
        )
        .mappings()
        .all()
    )
    events = [AuditEventOut.model_validate(dict(r)) for r in rows]
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(action="m06.auditLog.viewed", actor_kind="user", actor_id=auth.ctx.user_id, target_type="auditLog"),
    )
    return Page.of(events, int(total), page)


@router.get("/audit-checkpoints", response_model=Page[AuditCheckpointOut])
async def audit_checkpoints(auth: AuditReader, page: Paging) -> Page[AuditCheckpointOut]:
    """The tenant's signed chain heads (one per day), newest first."""
    rows = [
        AuditCheckpointOut.model_validate(cp, from_attributes=True)
        for cp in reversed(await list_checkpoints(auth.ctx.db))
    ]
    return Page.of(rows[page.offset : page.offset + page.page_size], len(rows), page)


@router.get("/audit-checkpoints/verify", response_model=AuditVerificationOut)
async def verify_audit_chain(auth: AuditReader, request: Request) -> AuditVerificationOut:
    """Recomputes the whole chain and checks each checkpoint's Vault signature and signed head."""
    report = await verify_checkpoints(auth.ctx.db, request.app.state.vault, auth.ctx.tenant.tenant_id)
    return AuditVerificationOut(
        ok=report.ok,
        checked_events=report.chain.checked,
        broken_at=report.chain.broken_at,
        checkpoints=[
            AuditCheckpointCheckOut(
                id=c.checkpoint.id,
                day=c.checkpoint.day,
                head_seq=c.checkpoint.head_seq,
                signature_valid=c.signature_valid,
                head_matches=c.head_matches,
            )
            for c in report.checkpoints
        ],
    )


@router.get("/consents", response_model=Page[ConsentOut])
async def consents(auth: ConsentReader, page: Paging) -> Page[ConsentOut]:
    """Staff with `m02.user.read` see all consents; a guardian only their own family's."""
    db = auth.ctx.db
    where, params = "", {}
    if not auth.grants.has("m02.user.read"):
        where, params = " WHERE person_id = ANY(:family)", {"family": sorted(await family_of(db, auth.ctx.person_id))}
    total = (await db.execute(text("SELECT count(*) FROM consents" + where), params)).scalar_one()  # noqa: S608
    rows = (
        (
            await db.execute(
                text(_CONSENTS + where + " ORDER BY recorded_at, id LIMIT :n OFFSET :o"),
                {**params, "n": page.page_size, "o": page.offset},
            )
        )
        .mappings()
        .all()
    )
    return Page.of([ConsentOut.model_validate(dict(r)) for r in rows], int(total), page)


@router.get("/data-requests", response_model=Page[DataSubjectRequestOut])
async def data_requests(auth: DsrManager, page: Paging) -> Page[DataSubjectRequestOut]:
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM data_subject_requests"))).scalar_one()
    rows = (
        (
            await db.execute(
                text(DSR_SELECT + " ORDER BY received_at, id LIMIT :n OFFSET :o"),
                {"n": page.page_size, "o": page.offset},
            )
        )
        .mappings()
        .all()
    )
    return Page.of([DataSubjectRequestOut.model_validate(dict(r)) for r in rows], int(total), page)


@router.patch("/data-requests/{dsr_id}", response_model=DataSubjectRequestOut)
async def step_request(dsr_id: str, auth: DsrManager, body: Annotated[Any, Body()]) -> DataSubjectRequestOut:
    """Move a request one step: received → in_progress → completed | rejected (else 409)."""
    db = auth.ctx.db
    await db.execute(text("SELECT 1 FROM data_subject_requests WHERE id = :id FOR UPDATE"), {"id": dsr_id})
    dsr = await dsr_out(db, dsr_id)
    if dsr is None:
        raise ApiError(404, "not_found", "Not found.")
    data = parse_body(DsrUpdateIn, body)
    issue = step_issue(dsr.status, data.status, data.reason)
    if issue is not None:
        raise issue
    return await move_request(db, auth.ctx.tenant, auth.ctx.user_id, dsr, data.status, data.reason)


@router.get("/compliance-packs", response_model=Page[CompliancePackOut])
async def compliance_packs(auth: AuditReader, page: Paging) -> Page[CompliancePackOut]:
    """The compliance packs that apply to this tenant."""
    packs = packs_for(await pack_codes(auth.ctx.db))
    return Page.of(packs[page.offset : page.offset + page.page_size], len(packs), page)
