"""M09 import job operations in the caller's tenant transaction."""

from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, insert, select
from sqlalchemy.exc import StatementError

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.modules.m02.models import RoleProfile
from nexus.modules.m09.models import ColumnMapping, ImportJob, ImportRowIssue
from nexus.modules.m09.schemas import ColumnMappingOut, ImportJobIn, ImportJobOut, ImportRowIssueOut


def _stored[Out: BaseModel](schema: type[Out], value: Any) -> Out:
    # Rows are checked against the frozen contract on the way out (as M14): broken stored data is a 500.
    try:
        return schema.model_validate(value, from_attributes=True)
    except ValidationError:
        raise ApiError(500, "internal", "Invalid stored import data.") from None


async def job_page(auth: Authorized, page: PageQuery) -> Page[ImportJobOut]:
    db = auth.ctx.db
    total = await db.scalar(select(func.count()).select_from(ImportJob))
    rows = await db.scalars(
        select(ImportJob).order_by(ImportJob.created_at, ImportJob.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([_stored(ImportJobOut, row) for row in rows], total or 0, page)


async def _job(auth: Authorized, job_id: str) -> str:
    found = await auth.ctx.db.scalar(select(ImportJob.id).where(ImportJob.id == job_id))
    if found is None:  # unknown, or another tenant's job (RLS hides it)
        raise ApiError(404, "not_found", "The import job was not found.")
    return found


async def mapping_page(auth: Authorized, job_id: str, page: PageQuery) -> Page[ColumnMappingOut]:
    job = await _job(auth, job_id)
    db = auth.ctx.db
    query = select(ColumnMapping).where(ColumnMapping.job_id == job)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.order_by(ColumnMapping.job_id).limit(page.page_size).offset(page.offset))
    items = [_stored(ColumnMappingOut, {"job_id": row.job_id, "columns": row.columns}) for row in rows]
    return Page.of(items, total or 0, page)


async def issue_page(auth: Authorized, job_id: str, page: PageQuery) -> Page[ImportRowIssueOut]:
    job = await _job(auth, job_id)
    db = auth.ctx.db
    query = select(ImportRowIssue).where(ImportRowIssue.job_id == job)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(
        query.order_by(ImportRowIssue.row_number, ImportRowIssue.id).limit(page.page_size).offset(page.offset)
    )
    return Page.of([_stored(ImportRowIssueOut, row) for row in rows], total or 0, page)


async def staff_profile(auth: Authorized) -> str:
    """The viewer's active staff role profile, or `403 forbidden` (the mock's order: before the body)."""
    profile = await auth.ctx.db.scalar(
        select(RoleProfile.id)
        .where(RoleProfile.person_id == auth.ctx.person_id, RoleProfile.kind == "staff", RoleProfile.status == "active")
        .order_by(RoleProfile.id)
        .limit(1)
    )
    if profile is None:
        raise ApiError(403, "forbidden", "You do not have permission to do this.")
    return profile


def parse_input(body: bytes) -> ImportJobIn:
    try:
        return ImportJobIn.model_validate_json(body)
    except ValidationError as exc:
        details = [
            ApiErrorDetail(
                path=""
                if issue["type"] in {"extra_forbidden", "json_invalid", "model_type"}
                else ".".join(map(str, issue["loc"])),
                message="Invalid JSON body" if issue["type"] == "json_invalid" else "Invalid import field",
            )
            for issue in exc.errors(include_input=False)
        ]
        raise ApiError(400, "invalid_request", "The request is not valid.", details) from None


async def create_import_job(auth: Authorized, profile_id: str, data: ImportJobIn) -> ImportJobOut:
    db = auth.ctx.db
    statement = (
        insert(ImportJob)
        .values(
            **data.model_dump(by_alias=False),
            id=new_id("imp").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
            template_version=1,
            status="uploaded",
            total_rows=0,
            valid_rows=0,
            error_rows=0,
            created_by_staff_profile_id=profile_id,
            rollback_until=None,
        )
        .returning(ImportJob)
    )
    try:
        job = _stored(ImportJobOut, (await db.execute(statement)).scalar_one())
    except StatementError:
        # A failed insert carries the file name in its parameters: never echo or log it.
        raise ApiError(500, "internal", "Could not create the import job.") from None
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m09.importJob.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="importJob",
            target_id=job.id,
            changes=changes(*data.model_dump(by_alias=True)),
        ),
    )
    return job
