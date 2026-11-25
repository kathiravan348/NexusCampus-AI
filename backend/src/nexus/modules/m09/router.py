"""Guarded M09 import job endpoints (no parsing or importing yet)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m09.schemas import ColumnMappingOut, ImportJobIn, ImportJobOut, ImportRowIssueOut
from nexus.modules.m09.service import create_import_job, issue_page, job_page, mapping_page, parse_input, staff_profile

router = APIRouter(prefix="/api/v1", tags=["m09 imports"])
Reader = Annotated[Authorized, Depends(require("m09.import.read", "M09"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m09.import.manage", "M09"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]


@router.get("/import-jobs")
async def import_jobs(auth: Reader, page: Paging) -> Page[ImportJobOut]:
    return await job_page(auth, page)


@router.get("/import-jobs/{job_id}/mappings")
async def mappings(job_id: str, auth: Reader, page: Paging) -> Page[ColumnMappingOut]:
    return await mapping_page(auth, job_id, page)


@router.get("/import-jobs/{job_id}/issues")
async def issues(job_id: str, auth: Reader, page: Paging) -> Page[ImportRowIssueOut]:
    return await issue_page(auth, job_id, page)


@router.post(
    "/import-jobs",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": ImportJobIn.model_json_schema(by_alias=True)}},
        }
    },
)
async def post_import_job(auth: Manager, request: Request) -> ImportJobOut:
    # The mock's order: module → permission (both in the guard) → active staff profile → body.
    profile = await staff_profile(auth)
    data = parse_input(await request.body())
    return await create_import_job(auth, profile, data)
