"""Tenant configuration endpoints (M08)."""

from typing import Annotated, get_args

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy import select

from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m08.models import CustomFieldDefinition, FormDefinition, NumberingFormat, WorkflowDefinition
from nexus.modules.m08.schemas import CustomFieldIn, CustomFieldOut, Entity, FormOut, NumberingOut, WorkflowOut
from nexus.modules.m08.service import create_field
from nexus.modules.m15.service import read_page

router = APIRouter(prefix="/api/v1", tags=["m08 configuration"])
Reader = Annotated[Authorized, Depends(require("m08.config.read", "M08"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m08.config.manage", "M08"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]


@router.get("/custom-fields", response_model_exclude_none=True)
async def custom_fields(auth: Reader, page: Paging, entity: str | None = None) -> Page[CustomFieldOut]:
    query = select(CustomFieldDefinition).order_by(CustomFieldDefinition.id)
    if entity is not None:
        if entity not in get_args(Entity):
            raise ApiError(400, "invalid_request", "The request is not valid.")
        query = query.where(CustomFieldDefinition.entity == entity)
    return await read_page(auth.ctx.db, query, CustomFieldOut, page)


@router.get("/forms")
async def forms(auth: Reader, page: Paging) -> Page[FormOut]:
    return await read_page(auth.ctx.db, select(FormDefinition).order_by(FormDefinition.id), FormOut, page)


@router.get("/workflows")
async def workflows(auth: Reader, page: Paging) -> Page[WorkflowOut]:
    return await read_page(auth.ctx.db, select(WorkflowDefinition).order_by(WorkflowDefinition.id), WorkflowOut, page)


@router.get("/numbering-formats")
async def numbering_formats(auth: Reader, page: Paging) -> Page[NumberingOut]:
    return await read_page(auth.ctx.db, select(NumberingFormat).order_by(NumberingFormat.id), NumberingOut, page)


@router.post(
    "/custom-fields",
    status_code=201,
    response_model_exclude_none=True,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": CustomFieldIn.model_json_schema()}},
        }
    },
)
async def post_custom_field(auth: Manager, request: Request) -> CustomFieldOut:
    try:
        data = CustomFieldIn.model_validate_json(await request.body())
    except ValidationError as exc:
        # Nested locale keys and extra properties may contain user data. Only emit contract field names.
        paths = {issue["loc"][0] for issue in exc.errors(include_input=False) if issue["loc"]}
        details = [
            ApiErrorDetail(path=key, message="Invalid field definition")
            for key in CustomFieldIn.model_fields
            if key in paths
        ]
        raise ApiError(400, "invalid_request", "The request is not valid.", details) from None
    return await create_field(auth, data)
