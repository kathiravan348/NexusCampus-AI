"""M07 Notifications API (NEX-056): templates (edit, add a language), delivery log, my preferences.

Same bodies, errors and audit actions as the mock (`handlers/m07.ts`). Template text must be valid ICU; `subject`
is required for email and null for other channels (as the contract). Preference saves accept `Idempotency-Key`
(the app's offline queue replays them).
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Header, Query, Request
from sqlalchemy import text

from nexus.core import idempotency
from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.validation import is_locale
from nexus.modules.m04.icu import is_valid_message
from nexus.modules.m07.schemas import DeliveryOut, NewTemplateIn, PreferencesIn, PreferencesOut, TemplateIn, TemplateOut
from nexus.modules.m07.service import TEMPLATE_SELECT, preferences_out, save_preferences

router = APIRouter(prefix="/api/v1", tags=["m07 notifications"])
TemplateManager = Annotated[Authorized, Depends(require("m07.template.manage", "M07"))]
PreferenceManager = Annotated[Authorized, Depends(require("m07.preference.manage", "M07"))]
Paging = Annotated[PageQuery, Depends(page_query)]
JsonBody = Annotated[Any, Body()]
_DELIVERY = (
    "SELECT id, tenant_id, template_id, recipient_person_id, channel, status, reason, queued_at, sent_at "
    "FROM notification_deliveries"
)


def _invalid(details: list[ApiErrorDetail]) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", details)


def _template_issues(data: TemplateIn, channel: str) -> list[ApiErrorDetail]:
    bad = []
    if (data.subject is not None) != (channel == "email"):
        bad.append(ApiErrorDetail(path="subject", message="subject is required for email and must be null otherwise"))
    if data.subject is not None and not is_valid_message(data.subject):
        bad.append(ApiErrorDetail(path="subject", message="Invalid ICU message"))
    if not is_valid_message(data.body):
        bad.append(ApiErrorDetail(path="body", message="Invalid ICU message"))
    return bad


async def _audit(auth: Authorized, action: str, target_type: str, target_id: str, fields: list[str]) -> None:
    await record_audit(
        auth.ctx.db,
        auth.ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type=target_type,
            target_id=target_id,
            changes=changes(*fields),
        ),
    )


async def _template(auth: Authorized, template_id: str) -> TemplateOut | None:
    row = (await auth.ctx.db.execute(text(TEMPLATE_SELECT + " WHERE id = :id"), {"id": template_id})).mappings()
    found = row.first()
    return TemplateOut.model_validate(dict(found)) if found else None


@router.get("/notification-templates", response_model=Page[TemplateOut])
async def templates(auth: TemplateManager, page: Paging) -> Page[TemplateOut]:
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM notification_templates"))).scalar_one()
    rows = await db.execute(
        text(TEMPLATE_SELECT + " ORDER BY event_type, channel, locale LIMIT :n OFFSET :o"),
        {"n": page.page_size, "o": page.offset},
    )
    return Page.of([TemplateOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.put("/notification-templates/{template_id}", response_model=TemplateOut)
async def update_template(template_id: str, auth: TemplateManager, body: JsonBody) -> TemplateOut:
    existing = await _template(auth, template_id)
    if existing is None:
        raise ApiError(404, "not_found", "Not found.")
    data = parse_body(TemplateIn, body)
    bad = _template_issues(data, existing.channel)
    if bad:
        raise _invalid(bad)
    await auth.ctx.db.execute(
        text(
            "UPDATE notification_templates SET subject = :s, body = :b, enabled = :e, version = version + 1, "
            "updated_at = :at WHERE id = :id"
        ),
        {"s": data.subject, "b": data.body, "e": data.enabled, "at": datetime.now(UTC), "id": template_id},
    )
    await _audit(auth, "m07.template.updated", "notificationTemplate", template_id, ["subject", "body", "enabled"])
    updated = await _template(auth, template_id)
    assert updated is not None
    return updated


@router.post("/notification-templates", status_code=201, response_model=TemplateOut)
async def create_template(auth: TemplateManager, body: JsonBody) -> TemplateOut:
    """A new locale version of an event + channel; duplicate event + channel + locale → 409."""
    data = parse_body(NewTemplateIn, body)
    if not is_locale(data.locale):
        raise _invalid([ApiErrorDetail(path="locale", message="Must be a canonical BCP 47 locale, e.g. en-IN")])
    db = auth.ctx.db
    duplicate = await db.execute(
        text("SELECT 1 FROM notification_templates WHERE event_type = :e AND channel = :c AND locale = :l"),
        {"e": data.event_type, "c": data.channel, "l": data.locale},
    )
    if duplicate.first():
        message = "This locale already has a template"
        raise ApiError(409, "conflict", message, [ApiErrorDetail(path="locale", message=message)])
    bad = _template_issues(data, data.channel)
    if bad:
        raise _invalid(bad)
    template_id = new_id("ntp")
    await db.execute(
        text(
            "INSERT INTO notification_templates (id, tenant_id, event_type, channel, locale, subject, body, version, "
            "enabled, updated_at) VALUES (:id, :t, :e, :c, :l, :s, :b, 1, :en, :at)"
        ),
        {
            "id": template_id,
            "t": auth.ctx.tenant.tenant_id,
            "e": data.event_type,
            "c": data.channel,
            "l": data.locale,
            "s": data.subject,
            "b": data.body,
            "en": data.enabled,
            "at": datetime.now(UTC),
        },
    )
    await _audit(
        auth, "m07.template.created", "notificationTemplate", template_id, ["eventType", "channel", "locale", "body"]
    )
    created = await _template(auth, template_id)
    assert created is not None
    return created


@router.get("/notification-deliveries", response_model=Page[DeliveryOut])
async def deliveries(
    auth: TemplateManager,
    page: Paging,
    status: Annotated[str | None, Query()] = None,
    channel: Annotated[str | None, Query()] = None,
) -> Page[DeliveryOut]:
    """Filters: `status`, `channel` (exact). Newest first."""
    clauses, params = [], {}
    for column, value in (("status", status), ("channel", channel)):
        if value is not None:
            clauses.append(f"{column} = :{column}")
            params[column] = value
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM notification_deliveries" + where), params)).scalar_one()  # noqa: S608
    rows = await db.execute(
        text(_DELIVERY + where + " ORDER BY queued_at DESC, id LIMIT :n OFFSET :o"),
        {**params, "n": page.page_size, "o": page.offset},
    )
    return Page.of([DeliveryOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.get("/notification-preferences", response_model=PreferencesOut)
async def my_preferences(auth: PreferenceManager) -> PreferencesOut:
    return await preferences_out(auth.ctx.db, auth.ctx.user_id)


@router.put("/notification-preferences", response_model=PreferencesOut)
async def put_preferences(
    auth: PreferenceManager,
    request: Request,
    body: JsonBody,
    key: Annotated[str | None, Header(alias=idempotency.HEADER)] = None,
) -> Any:
    """Saves the viewer's own switches and quiet hours; a replayed `Idempotency-Key` returns the first answer."""
    db, ctx = auth.ctx.db, auth.ctx
    digest = idempotency.request_hash(request.method, request.url.path, body)
    if key is not None:
        stored = await idempotency.replayed(db, idempotency.check_key(key), digest)
        if stored is not None:
            return stored
    data = parse_body(PreferencesIn, body)
    if data.quiet_hours is not None and data.quiet_hours.start == data.quiet_hours.end:
        raise _invalid([ApiErrorDetail(path="quietHours", message="Quiet hours need different start and end times")])
    result = await save_preferences(db, ctx.tenant.tenant_id, ctx.user_id, data)
    await _audit(auth, "m07.preference.updated", "user", ctx.user_id, ["channels", "quietHours"])
    if key is not None:
        await idempotency.remember(
            db, ctx.tenant.tenant_id, ctx.user_id, key, digest, result.model_dump(mode="json", by_alias=True)
        )
    return result
