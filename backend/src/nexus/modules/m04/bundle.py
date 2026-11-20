"""Compiled text bundle (NEX-054, ARCHITECTURE §4): a tenant's active overrides for one locale, per layer, with a
content hash as ETag. The app merges it over its own catalogues (en / hi / ta, D42) and revalidates with
`If-None-Match`, so an unchanged bundle costs a `304`."""

import hashlib
import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.modules.m04.schemas import TextBundle


async def build_bundle(db: AsyncSession, locale: str) -> TextBundle:
    rows = await db.execute(
        text(
            "SELECT scope_kind, scope_target_id, key, message FROM text_overrides "
            "WHERE locale = :l AND deleted_at IS NULL ORDER BY scope_kind, scope_target_id, key"
        ),
        {"l": locale},
    )
    group: dict[str, str] = {}
    institutions: dict[str, dict[str, str]] = {}
    campuses: dict[str, dict[str, str]] = {}
    for kind, target, key, message in rows.all():
        if kind == "group":
            group[key] = message
        elif kind == "institution":
            institutions.setdefault(target, {})[key] = message
        elif kind == "campus":
            campuses.setdefault(target, {})[key] = message
    body = json.dumps([locale, group, institutions, campuses], sort_keys=True, ensure_ascii=False)
    etag = '"' + hashlib.sha256(body.encode("utf-8")).hexdigest()[:32] + '"'
    return TextBundle(locale=locale, etag=etag, group=group, institutions=institutions, campuses=campuses)
