"""The error envelope must equal `frontend/packages/contracts/src/error.ts` (strict: no other keys)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

from nexus.core.errors import ApiError, ApiErrorDetail, ApiErrorEnvelope, install_error_handling

ZOD_CODES = {
    "invalid_request",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "module_disabled",
    "rate_limited",
    "internal",
}


class Locale(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timeZone: str  # JSON field name exactly as in the contract


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: Locale


@pytest.fixture
def api() -> Iterator[TestClient]:
    app = FastAPI()
    install_error_handling(app)

    @app.get("/disabled")
    async def disabled() -> None:
        raise ApiError(403, "module_disabled", "This module is not in your plan.")

    @app.get("/conflict")
    async def conflict() -> None:
        raise ApiError(409, "conflict", "Code already used.", [ApiErrorDetail(path="code", message="Taken")])

    @app.post("/validate")
    async def validate(body: Body) -> Body:
        return body

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret stack detail")

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def assert_envelope(body: dict[str, Any]) -> dict[str, Any]:
    assert set(body) == {"error"}
    error = body["error"]
    assert set(error) <= {"code", "message", "details", "requestId"}
    assert error["code"] in ZOD_CODES
    assert isinstance(error["message"], str) and error["message"]
    assert 1 <= len(error["requestId"]) <= 128
    for detail in error.get("details", []):
        assert set(detail) == {"path", "message"} and detail["message"]
    ApiErrorEnvelope.model_validate(body)
    assert isinstance(error, dict)
    return error


def test_api_error_keeps_status_and_code(api: TestClient) -> None:
    res = api.get("/disabled")
    assert res.status_code == 403
    error = assert_envelope(res.json())
    assert error["code"] == "module_disabled"
    assert "details" not in error
    assert error["requestId"] == res.headers["X-Request-Id"]


def test_details_are_passed_through(api: TestClient) -> None:
    error = assert_envelope(api.get("/conflict").json())
    assert error["details"] == [{"path": "code", "message": "Taken"}]


def test_validation_becomes_400_with_dotted_paths(api: TestClient) -> None:
    res = api.post("/validate", json={"locale": {}, "extra": 1})
    assert res.status_code == 400
    error = assert_envelope(res.json())
    assert error["code"] == "invalid_request"
    assert {d["path"] for d in error["details"]} == {"locale.timeZone", "extra"}


def test_unknown_route_is_not_found(api: TestClient) -> None:
    res = api.get("/nope")
    assert res.status_code == 404
    assert assert_envelope(res.json())["code"] == "not_found"


def test_unhandled_error_is_500_without_stack(api: TestClient) -> None:
    res = api.get("/boom")
    assert res.status_code == 500
    error = assert_envelope(res.json())
    assert error["code"] == "internal"
    assert "secret" not in res.text


def test_sample_matching_the_zod_contract_parses() -> None:
    sample = {
        "error": {
            "code": "invalid_request",
            "message": "Check the fields.",
            "details": [{"path": "locale.timeZone", "message": "Unknown time zone"}],
            "requestId": "req_01",
        }
    }
    assert ApiErrorEnvelope.model_validate(sample).model_dump(by_alias=True, exclude_none=True) == sample
    with pytest.raises(ValueError):
        ApiErrorEnvelope.model_validate({"error": {"code": "teapot", "message": "x"}})
    with pytest.raises(ValueError):
        ApiErrorEnvelope.model_validate({"error": {"code": "internal", "message": "x", "stack": "…"}})
