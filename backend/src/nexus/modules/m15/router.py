"""M15 academic structure endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import ValidationError
from sqlalchemy import select

from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m15.models import ClassGroup, Program, Subject, SubjectOffering, YearLevel
from nexus.modules.m15.schemas import (
    ClassGroupIn,
    ClassGroupOut,
    ProgramOut,
    SubjectOfferingOut,
    SubjectOut,
    YearLevelOut,
)
from nexus.modules.m15.service import create_group, read_page, year_exists

router = APIRouter(prefix="/api/v1", tags=["m15 academic structure"])
Reader = Annotated[Authorized, Depends(require("m15.structure.read", "M15"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m15.structure.manage", "M15"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]


@router.get("/programs")
async def programs(auth: Reader, page: Paging) -> Page[ProgramOut]:
    return await read_page(auth.ctx.db, select(Program).order_by(Program.id), ProgramOut, page)


@router.get("/year-levels")
async def year_levels(auth: Reader, page: Paging) -> Page[YearLevelOut]:
    return await read_page(auth.ctx.db, select(YearLevel).order_by(YearLevel.id), YearLevelOut, page)


@router.get("/class-groups")
async def class_groups(auth: Reader, page: Paging) -> Page[ClassGroupOut]:
    return await read_page(auth.ctx.db, select(ClassGroup).order_by(ClassGroup.id), ClassGroupOut, page)


@router.get("/subjects")
async def subjects(auth: Reader, page: Paging) -> Page[SubjectOut]:
    return await read_page(auth.ctx.db, select(Subject).order_by(Subject.id), SubjectOut, page)


@router.get("/subject-offerings")
async def subject_offerings(
    auth: Reader, page: Paging, academic_year_id: Annotated[str | None, Query(alias="academicYearId")] = None
) -> Page[SubjectOfferingOut]:
    query = select(SubjectOffering).order_by(SubjectOffering.id)
    if academic_year_id is not None:
        if not await year_exists(auth.ctx.db, academic_year_id):
            raise ApiError(404, "not_found", "Not found.")
        query = query.where(SubjectOffering.academic_year_id == academic_year_id)
    return await read_page(auth.ctx.db, query, SubjectOfferingOut, page)


@router.post(
    "/class-groups",
    status_code=201,
    openapi_extra={
        "requestBody": {"required": True, "content": {"application/json": {"schema": ClassGroupIn.model_json_schema()}}}
    },
)
async def post_class_group(auth: Manager, request: Request) -> ClassGroupOut:
    # Read the body after the guard so malformed JSON cannot mask a disabled module or missing permission.
    try:
        data = ClassGroupIn.model_validate_json(await request.body())
    except ValidationError as exc:
        details = [
            ApiErrorDetail(
                path="" if issue["type"] == "extra_forbidden" else ".".join(map(str, issue["loc"])),
                message="Invalid JSON body" if issue["type"] == "json_invalid" else issue["msg"],
            )
            for issue in exc.errors(include_input=False)
        ]
        raise ApiError(400, "invalid_request", "The request is not valid.", details) from None
    return await create_group(auth, data)
