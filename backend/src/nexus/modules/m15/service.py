"""Tenant-scoped academic lists and class-group creation. The caller owns the transaction."""

from sqlalchemy import Select, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.schemas import Contract
from nexus.modules.m15.models import Program, YearLevel
from nexus.modules.m15.schemas import ClassGroupIn, ClassGroupOut


async def read_page[Row, Out: Contract](
    db: AsyncSession, statement: Select[Row], schema: type[Out], page: PageQuery
) -> Page[Out]:
    total = (await db.execute(select(func.count()).select_from(statement.order_by(None).subquery()))).scalar_one()
    rows = await db.scalars(statement.limit(page.page_size).offset(page.offset))
    return Page.of([schema.model_validate(row, from_attributes=True) for row in rows], total, page)


async def year_exists(db: AsyncSession, year_id: str) -> bool:
    result = await db.execute(text("SELECT 1 FROM academic_calendars WHERE id = :id"), {"id": year_id})
    return result.scalar_one_or_none() is not None


def invalid(path: str, message: str) -> ApiError:
    return ApiError(400, "invalid_request", "The request is not valid.", [ApiErrorDetail(path=path, message=message)])


async def _institution_for_group(db: AsyncSession, data: ClassGroupIn) -> str:
    institution = await db.scalar(select(Program.institution_id).where(Program.id == data.program_id))
    if institution is None:
        raise invalid("programId", "Program does not belong to this tenant")
    if not await year_exists(db, data.academic_year_id):
        raise invalid("academicYearId", "Academic year does not belong to this tenant")
    if data.year_level_id is not None:
        program_id = await db.scalar(select(YearLevel.program_id).where(YearLevel.id == data.year_level_id))
        if program_id != data.program_id:
            raise invalid("yearLevelId", "Year level does not belong to this program")
    if data.campus_id is not None:
        campus = await db.execute(text("SELECT 1 FROM campuses WHERE id = :id"), {"id": data.campus_id})
        if campus.scalar_one_or_none() is None:
            raise invalid("campusId", "Campus does not belong to this tenant")
    if data.homeroom_staff_profile_id is not None:
        staff = await db.execute(
            text("SELECT 1 FROM role_profiles WHERE id = :id AND kind = 'staff'"),
            {"id": data.homeroom_staff_profile_id},
        )
        if staff.scalar_one_or_none() is None:
            raise invalid("homeroomStaffProfileId", "Staff profile does not belong to this tenant")
    return institution


async def create_group(auth: Authorized, data: ClassGroupIn) -> ClassGroupOut:
    db = auth.ctx.db
    institution = await _institution_for_group(db, data)
    result = await db.execute(
        text(
            "INSERT INTO class_groups (id, tenant_id, institution_id, campus_id, academic_year_id, program_id, "
            "year_level_id, kind, code, name, capacity, homeroom_staff_profile_id) VALUES "
            "(:id, :tenant_id, :institution_id, :campus_id, :academic_year_id, :program_id, :year_level_id, "
            ":kind, :code, :name, :capacity, :homeroom_staff_profile_id) "
            "ON CONFLICT (academic_year_id, lower(code)) DO NOTHING RETURNING *"
        ),
        {
            **data.model_dump(by_alias=False),
            "id": new_id("clg"),
            "tenant_id": auth.ctx.tenant.tenant_id,
            "institution_id": institution,
        },
    )
    row = result.mappings().one_or_none()
    if row is None:
        detail = ApiErrorDetail(
            path="code", message="A class group with this code already exists for this academic year"
        )
        raise ApiError(409, "conflict", "A class group with this code already exists.", [detail])
    group = ClassGroupOut.model_validate(dict(row))
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m15.classGroup.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="classGroup",
            target_id=group.id,
            changes=changes(*data.model_dump(by_alias=True).keys()),
        ),
    )
    return group
