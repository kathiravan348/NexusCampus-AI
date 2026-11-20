"""List pages, identical to `frontend/packages/contracts/src/page.ts` (D15): `?page=&pageSize=` →
`{ items, total, page, pageSize }`; page ≥ 1, pageSize 1 to 200 (default 50).
"""

from typing import Annotated, Self

from fastapi import Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

PAGE_SIZE_DEFAULT = 50
PAGE_SIZE_MAX = 200


class PageQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_query(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=PAGE_SIZE_MAX)] = PAGE_SIZE_DEFAULT,
) -> PageQuery:
    """FastAPI dependency for list endpoints."""
    return PageQuery(page=page, page_size=page_size)


class Page[T](BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    items: list[T]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(alias="pageSize", ge=1, le=PAGE_SIZE_MAX)

    @model_validator(mode="after")
    def _fits(self) -> Self:
        if len(self.items) > self.page_size:
            raise ValueError("A page cannot hold more items than pageSize")
        return self

    @classmethod
    def of(cls, items: list[T], total: int, query: PageQuery) -> "Page[T]":
        return cls(items=items, total=total, page=query.page, page_size=query.page_size)
