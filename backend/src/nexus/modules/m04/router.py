"""M04 Text & language studio API (NEX-054): overrides, revisions, import (with dry run), rollback, bundle.

Same bodies, errors and audit actions as the mock (`handlers/m04.ts`); messages are checked as ICU on the server.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query, Request, Response
from sqlalchemy import text

from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.validation import is_locale
from nexus.modules.m04.bundle import build_bundle
from nexus.modules.m04.icu import is_valid_message
from nexus.modules.m04.schemas import (
    DeleteOut,
    ImportIn,
    ImportResult,
    RevisionOut,
    RollbackIn,
    RollbackOut,
    SaveIn,
    TextBundle,
    TextOverrideOut,
)
from nexus.modules.m04.service import (
    OVERRIDE_SELECT,
    REVISION_SELECT,
    add_revision,
    archive,
    audit,
    evaluate_import,
    has_group_lock,
    institution_id,
    institution_row,
    invalid,
    locked,
    next_version,
    override_out,
    require_locale_and_key,
    upsert,
)

router = APIRouter(prefix="/api/v1", tags=["m04 text & language studio"])
Reader = Annotated[Authorized, Depends(require(None, "M04"), scope="function")]
Manager = Annotated[Authorized, Depends(require("m04.text.manage", "M04"), scope="function")]
Paging = Annotated[PageQuery, Depends(page_query)]
JsonBody = Annotated[Any, Body()]
LocaleQuery = Annotated[str | None, Query()]


@router.get("/texts/overrides", response_model=Page[TextOverrideOut])
async def list_overrides(auth: Reader, page: Paging, locale: LocaleQuery = None) -> Page[TextOverrideOut]:
    """Every user needs the overrides to render texts; `?locale=` keeps one locale."""
    where, params = " WHERE deleted_at IS NULL", {}
    if locale is not None:
        where, params = where + " AND locale = :l", {"l": locale}
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM text_overrides" + where), params)).scalar_one()  # noqa: S608
    rows = await db.execute(
        text(OVERRIDE_SELECT + where + " ORDER BY locale, key, scope_kind, id LIMIT :n OFFSET :o"),
        {**params, "n": page.page_size, "o": page.offset},
    )
    return Page.of([override_out(r) for r in rows.mappings()], int(total), page)


@router.get("/texts/revisions", response_model=Page[RevisionOut])
async def list_revisions(
    auth: Manager, page: Paging, key: Annotated[str | None, Query()] = None, locale: LocaleQuery = None
) -> Page[RevisionOut]:
    """History of the tenant's overrides; `?key=` / `?locale=` narrow to studio (group / institution) revisions."""
    clauses, params = [], {}
    if key is not None:
        clauses.append("o.key = :k AND o.scope_kind <> 'campus'")
        params["k"] = key
    if locale is not None:
        clauses.append("o.locale = :l")
        params["l"] = locale
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    base = "FROM text_override_revisions r JOIN text_overrides o ON o.id = r.override_id" + where
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) " + base), params)).scalar_one()
    rows = await db.execute(
        text(
            "SELECT r.override_id, r.version, r.message, r.changed_by, r.changed_at "
            + base
            + " ORDER BY r.changed_at, r.override_id, r.version LIMIT :n OFFSET :o"
        ),
        {**params, "n": page.page_size, "o": page.offset},
    )
    return Page.of([RevisionOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.put("/texts/overrides/{key}", response_model=TextOverrideOut)
async def save_override(key: str, auth: Manager, body: JsonBody, locale: LocaleQuery = None) -> TextOverrideOut:
    locale, key = require_locale_and_key(locale, key)
    message = parse_body(SaveIn, body).message
    if not is_valid_message(message):
        raise invalid([ApiErrorDetail(path="message", message="Invalid ICU message syntax")])
    db, ctx, user = auth.ctx.db, auth.ctx.tenant, auth.ctx.user_id
    if await has_group_lock(db, locale, key):
        raise locked(key)
    override, _ = await upsert(db, ctx, user, locale, key, message)
    await audit(db, ctx, user, "m04.text.updated", override.id)
    return override


@router.delete("/texts/overrides/{key}", response_model=DeleteOut)
async def delete_override(key: str, auth: Manager, locale: LocaleQuery = None) -> DeleteOut:
    locale, key = require_locale_and_key(locale, key)
    db, ctx, user = auth.ctx.db, auth.ctx.tenant, auth.ctx.user_id
    row = await institution_row(db, await institution_id(db), locale, key)
    if row is None or row["deleted_at"] is not None:
        if await has_group_lock(db, locale, key):
            raise locked(key)
        raise ApiError(404, "not_found", "Not found.")
    revision = await archive(db, ctx, user, row)
    await audit(db, ctx, user, "m04.text.deleted", row["id"])
    return DeleteOut(deleted=True, key=key, locale=locale, version=revision.version)


@router.post("/texts/overrides/import", response_model=ImportResult)
async def import_overrides(auth: Manager, body: JsonBody) -> ImportResult:
    """Dry run returns the diff; applying with any rejected entry is `400` (one detail per entry)."""
    data = parse_body(ImportIn, body)
    if not is_locale(data.locale):
        raise invalid([ApiErrorDetail(path="locale", message="Must be a canonical BCP 47 locale, e.g. en-IN")])
    db, ctx, user = auth.ctx.db, auth.ctx.tenant, auth.ctx.user_id
    added, changed, unchanged, rejected = await evaluate_import(db, data.locale, data.entries)
    if not data.dry_run and rejected:
        raise invalid([ApiErrorDetail(path=f"entries.{r.key}", message=r.message) for r in rejected])
    applied = 0
    if not data.dry_run:
        for item in [*added, *changed]:
            await upsert(db, ctx, user, data.locale, item.key, item.after)
            applied += 1
        if applied:
            await audit(db, ctx, user, "m04.text.imported", await institution_id(db))
    return ImportResult(
        dry_run=data.dry_run,
        locale=data.locale,
        added=added,
        changed=changed,
        unchanged=unchanged,
        rejected=rejected,
        applied_count=applied,
    )


@router.post("/texts/overrides/{key}/rollback", response_model=RollbackOut)
async def rollback(key: str, auth: Manager, body: JsonBody, locale: LocaleQuery = None) -> RollbackOut:
    """Restores a revision's message; rolling back to a deletion (`message: null`) deletes the override."""
    locale, key = require_locale_and_key(locale, key)
    version = parse_body(RollbackIn, body).version
    db, ctx, user = auth.ctx.db, auth.ctx.tenant, auth.ctx.user_id
    if await has_group_lock(db, locale, key):
        raise locked(key)
    row = await institution_row(db, await institution_id(db), locale, key)
    target = None
    if row is not None:
        target = (
            (
                await db.execute(
                    text(REVISION_SELECT + " WHERE override_id = :id AND version = :v"), {"id": row["id"], "v": version}
                )
            )
            .mappings()
            .first()
        )
    if row is None or target is None:
        raise ApiError(404, "not_found", "Not found.")
    if target["message"] is not None:
        override, revision = await upsert(db, ctx, user, locale, key, target["message"])
        result = RollbackOut(override=override, revision=revision)
    else:
        if row["deleted_at"] is None:
            revision = await archive(db, ctx, user, row)
        else:
            revision = await add_revision(db, ctx, row["id"], await next_version(db, row["id"]), None, user)
        result = RollbackOut(override=None, revision=revision)
    await audit(db, ctx, user, "m04.text.rolledBack", row["id"])
    return result


@router.get("/texts/bundle", response_model=TextBundle)
async def bundle(auth: Reader, request: Request, response: Response, locale: LocaleQuery = None) -> Any:
    """The tenant's overrides for `?locale=` per layer; `ETag` + `If-None-Match` → `304`."""
    if locale is None or not is_locale(locale):
        raise invalid([ApiErrorDetail(path="locale", message=f"Invalid or missing locale: {locale or ''}")])
    built = await build_bundle(auth.ctx.db, locale)
    headers = {"ETag": built.etag, "Cache-Control": "private, no-cache"}
    if request.headers.get("if-none-match") == built.etag:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return built
