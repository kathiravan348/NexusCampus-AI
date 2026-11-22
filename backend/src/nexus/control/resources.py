"""Readable Control resources (NEX-102): one list route (filters + page envelope, D15) and an optional detail route,
exactly as the mocks' `resourceHandlers` (frontend/packages/mocks/src/control/route.ts).

Partner scoping (P12) follows the mocks' `visibleTo`: a row with an account column is visible when its account is one
the partner manages; a row without one is matched by its own id (so partners never see catalogue, payments, …).
"""

from dataclasses import dataclass, field
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import ColumnElement, Table, false, func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from nexus.control.rows import from_db
from nexus.control.viewer import Viewer, require
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


def engine_of(request: Request) -> AsyncEngine:
    engine: AsyncEngine | None = request.app.state.engine
    if engine is None:
        raise ApiError(503, "internal", "The control database is not available.")
    return engine


def not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


@dataclass(frozen=True)
class Resource:
    path: str
    table: Table
    model: type[CamelModel]
    permission: str
    #: Query parameter (camelCase) → column; exact match, blank = no filter.
    filters: dict[str, str] = field(default_factory=dict)
    #: Column of the detail route (`GET /<path>/{key}`); None = list only.
    key: str | None = "id"
    order: Any = None

    @property
    def scope(self) -> str | None:
        if "account_id" in self.table.c:
            return "account_id"
        if "id" in self.table.c:
            return "id"
        return None

    def scoped(self, viewer: Viewer) -> list[ColumnElement[bool]]:
        if viewer.account_ids is None:
            return []
        if self.scope is None:
            return [false()]
        return [self.table.c[self.scope].in_(viewer.account_ids)]

    def parse(self, row: Any) -> CamelModel:
        """Only the contract's fields: internal columns (e.g. a licence's stored signature) never leave the API."""
        fields = self.model.model_fields
        return self.model.model_validate({k: v for k, v in from_db(self.table, row).items() if k in fields})


async def list_page(
    request: Request, r: Resource, viewer: Viewer, pages: PageQuery, filters: dict[str, str | None]
) -> Page[Any]:
    conds = [r.table.c[col] == value for col, value in filters.items() if value] + r.scoped(viewer)
    order = r.order if r.order is not None else r.table.c[r.key or "id"]
    async with engine_of(request).connect() as conn:
        total = (await conn.execute(select(func.count()).select_from(r.table).where(*conds))).scalar_one()
        rows = await conn.execute(
            select(r.table).where(*conds).order_by(order).limit(pages.page_size).offset(pages.offset)
        )
        items = [r.parse(row) for row in rows.mappings()]
    return Page[Any].of(items, total, pages)


async def get_one(request: Request, r: Resource, viewer: Viewer, value: str, column: str | None = None) -> CamelModel:
    col = column or r.key or "id"
    async with engine_of(request).connect() as conn:
        row = (await conn.execute(select(r.table).where(r.table.c[col] == value, *r.scoped(viewer)))).mappings().first()
    if row is None:
        raise not_found()
    return r.parse(row)


def mount(router: APIRouter, r: Resource) -> None:
    """Adds `GET /<path>` (and `GET /<path>/{key}`) guarded by the resource's permission."""
    Reader = Annotated[Viewer, Depends(require(r.permission))]
    Pages = Annotated[PageQuery, Depends(page_query)]

    async def list_route(request: Request, viewer: Reader, pages: Pages) -> Any:
        wanted = {col: (request.query_params.get(q) or "").strip() or None for q, col in r.filters.items()}
        return await list_page(request, r, viewer, pages, wanted)

    page_model = Page[r.model]  # type: ignore[name-defined]
    router.add_api_route(f"/{r.path}", list_route, methods=["GET"], response_model=page_model, name=f"list_{r.path}")
    if r.key is not None:

        async def detail_route(request: Request, viewer: Reader, item_id: str) -> Any:
            return await get_one(request, r, viewer, item_id)

        router.add_api_route(
            f"/{r.path}/{{item_id}}", detail_route, methods=["GET"], response_model=r.model, name=f"get_{r.path}"
        )
