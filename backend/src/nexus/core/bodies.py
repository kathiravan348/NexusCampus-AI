"""Request bodies validated like the Zod contracts: field problems **and** cross-field rules are reported
together in one `400 invalid_request`, with dotted paths (`periods.1`, `timeZone`).
"""

import contextlib
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from nexus.core.errors import ApiError, ApiErrorDetail

Issue = tuple[str, str]
CrossCheck = Callable[[dict[str, Any]], list[Issue]]


def _path(loc: tuple[int | str, ...]) -> str:
    return ".".join(str(p) for p in loc)


def parse_body[M: BaseModel](model: type[M], raw: Any, cross_check: CrossCheck | None = None) -> M:
    if not isinstance(raw, dict):
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="", message="Expected an object")],
        )
    details: list[ApiErrorDetail] = []
    parsed: M | None = None
    try:
        parsed = model.model_validate(raw)
    except ValidationError as exc:
        details += [ApiErrorDetail(path=_path(e["loc"]), message=e["msg"]) for e in exc.errors()]
    if cross_check is not None:
        # Wrong types are already reported above; a cross-check that trips over them adds nothing.
        with contextlib.suppress(TypeError, KeyError, AttributeError, ValueError):
            details += [ApiErrorDetail(path=p, message=m) for p, m in cross_check(raw)]
    if details or parsed is None:
        raise ApiError(400, "invalid_request", "The request is not valid.", details)
    return parsed
