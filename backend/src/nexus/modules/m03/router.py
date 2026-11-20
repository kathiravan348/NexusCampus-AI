"""M03 Theme studio API (NEX-053): theme layers and the font library. Same responses, errors and audit as the mock
(`handlers/m03.ts`); the server repeats the WCAG 2.2 AA contrast guard, so no failing theme can be stored.
"""

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import text

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m03.schemas import FontOut, ThemeResponse, ThemeUpdateIn
from nexus.modules.m03.service import (
    contrast_failures,
    invalid,
    locked_conflicts,
    merge_themes,
    tenant_layers,
    unknown_tokens,
)

router = APIRouter(prefix="/api/v1", tags=["m03 theme studio"])
Reader = Annotated[Authorized, Depends(require(None, "M03"))]
Manager = Annotated[Authorized, Depends(require("m03.theme.manage", "M03"))]
_FONTS = "SELECT id, family, source, roles, scripts, file_url FROM fonts"


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found.")


@router.get("/theme", response_model=ThemeResponse)
async def get_theme(auth: Reader, campus_id: Annotated[str | None, Query(alias="campusId")] = None) -> ThemeResponse:
    """`?campusId=` adds that campus's layer and its institution's; without it, all institution layers."""
    db = auth.ctx.db
    institution_id = None
    if campus_id is not None:
        institution_id = (
            await db.execute(text("SELECT institution_id FROM campuses WHERE id = :id"), {"id": campus_id})
        ).scalar_one_or_none()
        if institution_id is None:
            raise _not_found()
    layers = [
        t
        for t in await tenant_layers(db)
        if (t.scope.kind != "campus" or t.scope.target_id == campus_id)
        and (t.scope.kind != "institution" or campus_id is None or t.scope.target_id == institution_id)
    ]
    effective, locked = merge_themes(layers)
    return ThemeResponse(effective=effective, layers=layers, locked_tokens=locked)


@router.put("/theme", response_model=ThemeResponse)
async def put_theme(
    auth: Manager,
    body: Annotated[Any, Body()],
    institution_id: Annotated[str | None, Query(alias="institutionId")] = None,
) -> ThemeResponse:
    db = auth.ctx.db
    institutions = list((await db.execute(text("SELECT id FROM institutions ORDER BY created_at, id"))).scalars())
    target = institutions[0] if institution_id is None and institutions else institution_id
    if target not in institutions:
        raise _not_found()
    layers = [t for t in await tenant_layers(db) if t.scope.kind != "campus"]
    outer = [t for t in layers if t.scope.kind in ("platform", "group")]
    existing = next((t for t in layers if t.scope.kind == "institution" and t.scope.target_id == target), None)
    if existing is None:
        raise _not_found()
    data = parse_body(ThemeUpdateIn, body)
    font_ids = set((await db.execute(text("SELECT id FROM fonts"))).scalars())
    bad = unknown_tokens(data, font_ids)
    if bad:
        raise invalid(bad)
    conflicts = locked_conflicts(data, {t for layer in outer for t in layer.locked_tokens})
    if conflicts:
        raise ApiError(409, "conflict", "Some tokens are locked by a parent theme layer.", conflicts)
    now = datetime.now(UTC)
    updated = existing.model_copy(
        update={
            **{k: getattr(data, k) for k in ("light", "dark", "fonts", "radius", "density", "assets")},
            "version": existing.version + 1,
            "updated_by": auth.ctx.user_id,
            "updated_at": now,
        }
    )
    effective, locked = merge_themes([*outer, updated])
    failures = contrast_failures(effective)
    if failures:
        raise invalid(failures)
    dumped = updated.model_dump(mode="json", by_alias=True)
    await db.execute(
        text(
            "UPDATE themes SET light = CAST(:light AS jsonb), dark = CAST(:dark AS jsonb), "
            "fonts = CAST(:fonts AS jsonb), radius = CAST(:radius AS jsonb), density = :density, "
            "assets = CAST(:assets AS jsonb), version = :version, updated_by = :by, updated_at = :at WHERE id = :id"
        ),
        {
            **{k: json.dumps(dumped[k]) for k in ("light", "dark", "fonts", "radius", "assets")},
            "density": updated.density,
            "version": updated.version,
            "by": updated.updated_by,
            "at": now,
            "id": updated.id,
        },
    )
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m03.theme.updated",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="theme",
            target_id=updated.id,
            changes=changes("light", "dark", "fonts", "radius", "density", "assets"),
        ),
    )
    return ThemeResponse(effective=effective, layers=[*outer, updated], locked_tokens=locked)


@router.get("/fonts", response_model=Page[FontOut])
async def fonts(auth: Reader, page: Annotated[PageQuery, Depends(page_query)]) -> Page[FontOut]:
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM fonts"))).scalar_one()
    rows = (
        (
            await db.execute(
                text(_FONTS + " ORDER BY family, id LIMIT :n OFFSET :o"), {"n": page.page_size, "o": page.offset}
            )
        )
        .mappings()
        .all()
    )
    return Page.of([FontOut.model_validate(dict(r)) for r in rows], int(total), page)
