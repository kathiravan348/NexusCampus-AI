"""Every `APIRoute` of an app, including routes of included routers (FastAPI ≥ 0.16x keeps those nested in
`_IncludedRouter` entries instead of copying them into `app.routes`)."""

from typing import Any

from fastapi.routing import APIRoute


def api_routes(app: Any) -> list[APIRoute]:
    found: list[APIRoute] = []

    def walk(routes: list[Any]) -> None:
        for route in routes:
            if isinstance(route, APIRoute):
                found.append(route)
            elif hasattr(route, "original_router"):
                # Routers carry their own prefix and guards; include-time ones would be invisible here.
                assert not route.include_context.prefix and not route.include_context.dependencies
                walk(route.original_router.routes)

    walk(app.routes)
    return found
