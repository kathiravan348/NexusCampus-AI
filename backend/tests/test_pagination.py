"""Pages must equal `frontend/packages/contracts/src/page.ts` (D15)."""

from collections.abc import Iterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from nexus.core.errors import install_error_handling
from nexus.core.pagination import PAGE_SIZE_DEFAULT, Page, PageQuery, page_query


@pytest.fixture
def api() -> Iterator[TestClient]:
    app = FastAPI()
    install_error_handling(app)
    numbers = list(range(1, 121))

    @app.get("/numbers")
    async def list_numbers(q: Annotated[PageQuery, Depends(page_query)]) -> Page[int]:
        return Page.of(numbers[q.offset : q.offset + q.page_size], len(numbers), q)

    with TestClient(app) as c:
        yield c


def test_defaults_page_1_size_50(api: TestClient) -> None:
    body = api.get("/numbers").json()
    assert set(body) == {"items", "total", "page", "pageSize"}
    assert (body["page"], body["pageSize"], body["total"]) == (1, PAGE_SIZE_DEFAULT, 120)
    assert body["items"][0] == 1 and len(body["items"]) == 50


def test_page_and_page_size_from_query(api: TestClient) -> None:
    body = api.get("/numbers?page=3&pageSize=50").json()
    assert body["items"] == list(range(101, 121))


@pytest.mark.parametrize("query", ["page=0", "pageSize=0", "pageSize=201"])
def test_out_of_range_is_invalid_request(api: TestClient, query: str) -> None:
    res = api.get(f"/numbers?{query}")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_request"


def test_a_page_never_holds_more_items_than_page_size() -> None:
    with pytest.raises(ValueError):
        Page[int](items=[1, 2, 3], total=3, page=1, page_size=2)
    sample = {"items": ["a"], "total": 1, "page": 1, "pageSize": 50}
    assert Page[str].model_validate(sample).model_dump(by_alias=True) == sample
