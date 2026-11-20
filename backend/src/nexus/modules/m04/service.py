"""M04 override store (NEX-054): the mock's rules (`handlers/m04Store.ts`) on PostgreSQL.

The studio edits the tenant's (first) institution layer. A group override of the same locale + key locks it.
Versions never go backwards: a re-created or rolled-back override continues after its highest revision.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext
from nexus.core.validation import is_locale
from nexus.modules.m03.schemas import ScopeOut
from nexus.modules.m04.icu import is_valid_message
from nexus.modules.m04.schemas import DiffEntry, RejectedEntry, RevisionOut, TextOverrideOut

#: Known message keys, exported from `frontend/packages/i18n/messages/en.json` (never edited by hand).
KNOWN_KEYS = frozenset(json.loads(Path(__file__).with_name("message_keys.json").read_text(encoding="utf-8")))
OVERRIDE_SELECT = (
    "SELECT id, tenant_id, scope_kind, scope_target_id, locale, key, message, version, updated_by, updated_at "
    "FROM text_overrides"
)
REVISION_SELECT = "SELECT override_id, version, message, changed_by, changed_at FROM text_override_revisions"


def override_out(row: Any) -> TextOverrideOut:
    r = dict(row)
    r["scope"] = ScopeOut(kind=r.pop("scope_kind"), target_id=r.pop("scope_target_id"))
    return TextOverrideOut.model_validate(r)


def invalid(details: list[ApiErrorDetail]) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", details)


def locked(key: str) -> ApiError:
    message = f"Key {key} is locked by a group override"
    return ApiError(409, "conflict", message, [ApiErrorDetail(path="key", message=message)])


def require_locale_and_key(locale: str | None, key: str) -> tuple[str, str]:
    value = (locale or "").strip()
    bad = []
    if not is_locale(value):
        bad.append(ApiErrorDetail(path="locale", message=f"Invalid or missing locale: {value}"))
    if key not in KNOWN_KEYS:
        bad.append(ApiErrorDetail(path="key", message=f"Unknown message key: {key}"))
    if bad:
        raise invalid(bad)
    return value, key


async def institution_id(db: AsyncSession) -> str:
    first = (await db.execute(text("SELECT id FROM institutions ORDER BY created_at, id LIMIT 1"))).scalar_one_or_none()
    if first is None:
        raise ApiError(404, "not_found", "Not found.")
    return str(first)


async def has_group_lock(db: AsyncSession, locale: str, key: str) -> bool:
    found = await db.execute(
        text(
            "SELECT 1 FROM text_overrides WHERE scope_kind = 'group' AND locale = :l AND key = :k "
            "AND deleted_at IS NULL"
        ),
        {"l": locale, "k": key},
    )
    return found.first() is not None


async def institution_row(db: AsyncSession, inst: str, locale: str, key: str) -> Any:
    """The institution override row, deleted or not (`deleted_at` tells), locked for update."""
    return (
        (
            await db.execute(
                text(
                    OVERRIDE_SELECT.replace(" FROM", ", deleted_at FROM")
                    + " WHERE scope_kind = 'institution' AND scope_target_id = :i AND locale = :l AND key = :k "
                    "FOR UPDATE"
                ),
                {"i": inst, "l": locale, "k": key},
            )
        )
        .mappings()
        .first()
    )


async def next_version(db: AsyncSession, override_id: str, current: int = 0) -> int:
    top = (
        await db.execute(
            text("SELECT coalesce(max(version), 0) FROM text_override_revisions WHERE override_id = :id"),
            {"id": override_id},
        )
    ).scalar_one()
    return max(current, int(top)) + 1


async def add_revision(
    db: AsyncSession, ctx: TenantContext, override_id: str, version: int, message: str | None, user: str
) -> RevisionOut:
    now = datetime.now(UTC)
    await db.execute(
        text(
            "INSERT INTO text_override_revisions (override_id, version, tenant_id, message, changed_by, changed_at) "
            "VALUES (:id, :v, :t, :m, :by, :at)"
        ),
        {"id": override_id, "v": version, "t": ctx.tenant_id, "m": message, "by": user, "at": now},
    )
    return RevisionOut(override_id=override_id, version=version, message=message, changed_by=user, changed_at=now)


async def upsert(
    db: AsyncSession, ctx: TenantContext, user: str, locale: str, key: str, message: str
) -> tuple[TextOverrideOut, RevisionOut]:
    inst = await institution_id(db)
    row = await institution_row(db, inst, locale, key)
    override_id = row["id"] if row else new_id("tov")
    version = await next_version(db, override_id, row["version"] if row else 0)
    now = datetime.now(UTC)
    params = {"id": override_id, "m": message, "v": version, "by": user, "at": now}
    if row:
        await db.execute(
            text(
                "UPDATE text_overrides SET message = :m, version = :v, updated_by = :by, updated_at = :at, "
                "deleted_at = NULL WHERE id = :id"
            ),
            params,
        )
    else:
        await db.execute(
            text(
                "INSERT INTO text_overrides (id, tenant_id, scope_kind, scope_target_id, locale, key, message, "
                "version, updated_by, updated_at) VALUES (:id, :t, 'institution', :i, :l, :k, :m, :v, :by, :at)"
            ),
            {**params, "t": ctx.tenant_id, "i": inst, "l": locale, "k": key},
        )
    revision = await add_revision(db, ctx, override_id, version, message, user)
    saved = (await db.execute(text(OVERRIDE_SELECT + " WHERE id = :id"), {"id": override_id})).mappings().one()
    return override_out(saved), revision


async def archive(db: AsyncSession, ctx: TenantContext, user: str, row: Any) -> RevisionOut:
    """Deletes an active override (the row stays for its id and history) and records a `null` revision."""
    version = await next_version(db, row["id"], row["version"])
    await db.execute(
        text("UPDATE text_overrides SET deleted_at = now() WHERE id = :id AND deleted_at IS NULL"), {"id": row["id"]}
    )
    return await add_revision(db, ctx, row["id"], version, None, user)


async def audit(db: AsyncSession, ctx: TenantContext, user: str, action: str, target_id: str) -> None:
    await record_audit(
        db,
        ctx,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=user,
            target_type="textOverride",
            target_id=target_id,
            changes=changes("message"),
        ),
    )


async def evaluate_import(
    db: AsyncSession, locale: str, entries: dict[str, Any]
) -> tuple[list[DiffEntry], list[DiffEntry], list[str], list[RejectedEntry]]:
    """Same checks, order and reasons as the mock's `evaluateImportEntries`."""
    inst = await institution_id(db)
    added: list[DiffEntry] = []
    changed: list[DiffEntry] = []
    unchanged: list[str] = []
    rejected: list[RejectedEntry] = []
    for key, raw in entries.items():
        trimmed = raw.strip() if isinstance(raw, str) else ""
        if key not in KNOWN_KEYS:
            rejected.append(RejectedEntry(key=key, reason="unknown_key", message=f"Unknown message key: {key}"))
        elif not isinstance(raw, str):
            rejected.append(RejectedEntry(key=key, reason="invalid_value", message="Value must be a string"))
        elif not trimmed or len(trimmed) > 5000:
            rejected.append(RejectedEntry(key=key, reason="empty_message", message="Message cannot be empty"))
        elif not is_valid_message(trimmed):
            rejected.append(RejectedEntry(key=key, reason="invalid_icu", message="Invalid ICU message syntax"))
        elif await has_group_lock(db, locale, key):
            rejected.append(RejectedEntry(key=key, reason="locked_by_group", message="Locked by a group override"))
        else:
            row = await institution_row(db, inst, locale, key)
            existing = row["message"] if row and row["deleted_at"] is None else None
            if existing == trimmed:
                unchanged.append(key)
            elif existing is not None:
                changed.append(DiffEntry(key=key, before=existing, after=trimmed))
            else:
                added.append(DiffEntry(key=key, before=None, after=trimmed))
    return added, changed, unchanged, rejected
