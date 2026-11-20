"""M01 Institution setup API (NEX-047): same paths, bodies, errors and audit actions as the mock
(`docs/guides/API.md`).

Reads need the module switched on; writes need `m01.institution.manage`. Every write audits in the same
transaction. Other tenants' ids answer 404 (RLS makes them invisible).
"""

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m01.profiles import PROFILES
from nexus.modules.m01.schemas import (
    CalendarInput,
    CalendarOut,
    CampusInput,
    CampusOut,
    GroupOut,
    InstitutionOut,
    LocaleSettings,
    TenantOut,
    TypeProfileOut,
    calendar_issues,
    locale_issues,
)

router = APIRouter(prefix="/api/v1", tags=["m01 institution setup"])
READ = require(None, "M01")
MANAGE = require("m01.institution.manage", "M01")
Reader = Annotated[Authorized, Depends(READ)]
Manager = Annotated[Authorized, Depends(MANAGE)]

_INSTITUTION = (
    "SELECT id, tenant_id, group_id, name, type, region, status, default_locale, supported_locales, "
    "time_zone, "
    "currency, country, weekend_days, created_at, updated_at FROM institutions"
)
_CAMPUS = "SELECT id, tenant_id, institution_id, code, name, time_zone, address FROM campuses"
_CALENDAR = (
    "SELECT id, tenant_id, institution_id, academic_year, starts_on, ends_on, display_calendar, periods, "
    "holidays "
    "FROM academic_calendars"
)


def _institution(row: Any) -> InstitutionOut:
    r = dict(row)
    r["locale"] = {
        "defaultLocale": r.pop("default_locale"),
        "supportedLocales": r.pop("supported_locales"),
        "timeZone": r.pop("time_zone"),
        "currency": r.pop("currency"),
        "country": r.pop("country"),
        "weekendDays": r.pop("weekend_days"),
    }
    return InstitutionOut.model_validate(r)


async def _find_institution(db: AsyncSession, institution_id: str | None) -> InstitutionOut:
    """`institution_id`, else the tenant's first institution; 404 if not visible in this tenant."""
    if institution_id is None:
        row = (await db.execute(text(f"{_INSTITUTION} ORDER BY created_at, id LIMIT 1"))).mappings().first()
    else:
        row = (
            (await db.execute(text(f"{_INSTITUTION} WHERE id = :id"), {"id": institution_id}))
            .mappings()
            .first()
        )
    if row is None:
        raise ApiError(404, "not_found", "Not found.")
    return _institution(row)


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


@router.get("/tenant", response_model=TenantOut, response_model_by_alias=True)
async def tenant(auth: Reader) -> TenantOut:
    db = auth.ctx.db
    group = (
        (await db.execute(text("SELECT id, tenant_id, name, region, created_at, updated_at FROM groups")))
        .mappings()
        .first()
    )
    institutions = (await db.execute(text(f"{_INSTITUTION} ORDER BY created_at, id"))).mappings().all()
    campuses = (await db.execute(text(f"{_CAMPUS} ORDER BY created_at, id"))).mappings().all()
    return TenantOut(
        group=GroupOut.model_validate(dict(group)) if group else None,
        institutions=[_institution(r) for r in institutions],
        campuses=[CampusOut.model_validate(dict(r)) for r in campuses],
    )


@router.get(
    "/institutions/{institution_id}/profile", response_model=TypeProfileOut, response_model_by_alias=True
)
async def profile(institution_id: str, auth: Reader) -> TypeProfileOut:
    institution = await _find_institution(auth.ctx.db, institution_id)
    found = PROFILES.get(institution.type)
    if found is None:
        raise ApiError(404, "not_found", "Not found.")
    return found


@router.get(
    "/institutions/{institution_id}/calendars", response_model=Page[CalendarOut], response_model_by_alias=True
)
async def calendars(
    institution_id: str, auth: Reader, page: Annotated[PageQuery, Depends(page_query)]
) -> Page[CalendarOut]:
    institution = await _find_institution(auth.ctx.db, institution_id)
    db = auth.ctx.db
    total = (
        await db.execute(
            text("SELECT count(*) FROM academic_calendars WHERE institution_id = :i"), {"i": institution.id}
        )
    ).scalar_one()
    rows = (
        (
            await db.execute(
                text(f"{_CALENDAR} WHERE institution_id = :i ORDER BY starts_on, id LIMIT :n OFFSET :o"),
                {"i": institution.id, "n": page.page_size, "o": page.offset},
            )
        )
        .mappings()
        .all()
    )
    return Page.of([CalendarOut.model_validate(dict(r)) for r in rows], int(total), page)


@router.get("/locale-settings", response_model=LocaleSettings, response_model_by_alias=True)
async def get_locale(
    auth: Reader, institution_id: Annotated[str | None, Query(alias="institutionId")] = None
) -> LocaleSettings:
    return (await _find_institution(auth.ctx.db, institution_id)).locale


@router.put("/locale-settings", response_model=LocaleSettings, response_model_by_alias=True)
async def put_locale(
    auth: Manager,
    body: Annotated[Any, Body()],
    institution_id: Annotated[str | None, Query(alias="institutionId")] = None,
) -> LocaleSettings:
    institution = await _find_institution(auth.ctx.db, institution_id)
    locale = parse_body(LocaleSettings, body, locale_issues)
    await auth.ctx.db.execute(
        text(
            "UPDATE institutions SET default_locale = :dl, supported_locales = :sl, time_zone = :tz, "
            "currency = :cur, "
            "country = :c, weekend_days = :wd, updated_at = :now WHERE id = :id"
        ),
        {
            "dl": locale.default_locale,
            "sl": locale.supported_locales,
            "tz": locale.time_zone,
            "cur": locale.currency,
            "c": locale.country,
            "wd": locale.weekend_days,
            "now": datetime.now(UTC),
            "id": institution.id,
        },
    )
    await _audit(auth, "m01.institution.updated", "institution", institution.id, ["locale"])
    return locale


async def _save_campus(auth: Authorized, campus_id: str, body: Any, *, create: bool) -> CampusOut:
    data = parse_body(CampusInput, body)
    institution = await _find_institution(auth.ctx.db, data.institution_id)
    duplicate = (
        await auth.ctx.db.execute(
            text("SELECT 1 FROM campuses WHERE institution_id = :i AND code = :c AND id <> :id"),
            {"i": institution.id, "c": data.code, "id": campus_id},
        )
    ).first()
    if duplicate:
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="code", message="Campus code is already in use")],
        )
    params = {
        "id": campus_id,
        "t": auth.ctx.tenant.tenant_id,
        "i": institution.id,
        "code": data.code,
        "name": data.name,
        "tz": data.time_zone,
        "addr": json.dumps(data.address.model_dump(by_alias=True)),
    }
    try:
        if create:
            await auth.ctx.db.execute(
                text(
                    "INSERT INTO campuses (id, tenant_id, institution_id, code, name, time_zone, address) "
                    "VALUES (:id, :t, :i, :code, :name, :tz, CAST(:addr AS jsonb))"
                ),
                params,
            )
        else:
            await auth.ctx.db.execute(
                text(
                    "UPDATE campuses SET institution_id = :i, code = :code, name = :name, time_zone = :tz, "
                    "address = CAST(:addr AS jsonb), updated_at = now() WHERE id = :id"
                ),
                params,
            )
    except IntegrityError as exc:  # a concurrent writer took the code
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="code", message="Campus code is already in use")],
        ) from exc
    action, fields = (
        ("m01.campus.created", ["code", "name"])
        if create
        else ("m01.campus.updated", ["code", "name", "timeZone", "address"])
    )
    await _audit(auth, action, "campus", campus_id, fields)
    return CampusOut(id=campus_id, tenant_id=auth.ctx.tenant.tenant_id, **data.model_dump())


@router.post("/campuses", status_code=201, response_model=CampusOut, response_model_by_alias=True)
async def create_campus(auth: Manager, body: Annotated[Any, Body()]) -> CampusOut:
    return await _save_campus(auth, new_id("cmp"), body, create=True)


@router.put("/campuses/{campus_id}", response_model=CampusOut, response_model_by_alias=True)
async def update_campus(campus_id: str, auth: Manager, body: Annotated[Any, Body()]) -> CampusOut:
    exists = (
        await auth.ctx.db.execute(text("SELECT 1 FROM campuses WHERE id = :id"), {"id": campus_id})
    ).first()
    if not exists:
        raise ApiError(404, "not_found", "Not found.")
    return await _save_campus(auth, campus_id, body, create=False)


@router.put(
    "/institutions/{institution_id}/calendars/{calendar_id}",
    response_model=CalendarOut,
    response_model_by_alias=True,
)
async def update_calendar(
    institution_id: str, calendar_id: str, auth: Manager, body: Annotated[Any, Body()]
) -> CalendarOut:
    institution = await _find_institution(auth.ctx.db, institution_id)
    existing = (
        await auth.ctx.db.execute(
            text("SELECT id FROM academic_calendars WHERE id = :id AND institution_id = :i"),
            {"id": calendar_id, "i": institution.id},
        )
    ).first()
    if existing is None:
        raise ApiError(404, "not_found", "Not found.")
    data = parse_body(CalendarInput, body, calendar_issues)
    out = CalendarOut(
        id=calendar_id,
        tenant_id=auth.ctx.tenant.tenant_id,
        institution_id=institution.id,
        **data.model_dump(exclude={"id", "tenant_id", "institution_id"}),
    )
    dumped = out.model_dump(by_alias=True, mode="json")
    await auth.ctx.db.execute(
        text(
            "UPDATE academic_calendars SET academic_year = :y, starts_on = :s, ends_on = :e, "
            "display_calendar = :dc, "
            "periods = CAST(:p AS jsonb), holidays = CAST(:h AS jsonb), updated_at = now() WHERE id = :id"
        ),
        {
            "y": out.academic_year,
            "s": out.starts_on,
            "e": out.ends_on,
            "dc": out.display_calendar,
            "p": json.dumps(dumped["periods"]),
            "h": json.dumps(dumped["holidays"]),
            "id": calendar_id,
        },
    )
    await _audit(
        auth,
        "m01.calendar.updated",
        "academicCalendar",
        calendar_id,
        ["academicYear", "periods", "holidays", "displayCalendar"],
    )
    return out
