"""Staff admissions operations in the caller's tenant transaction."""

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m12.models import Application, Enquiry
from nexus.modules.m12.schemas import ApplicationOut, EnquiryIn, EnquiryOut
from nexus.modules.m13.schemas import CustomFields
from nexus.modules.m15.models import Program
from nexus.modules.m15.service import invalid

_ANSWERS: TypeAdapter[CustomFields] = TypeAdapter(CustomFields)


async def create_enquiry(auth: Authorized, data: EnquiryIn) -> EnquiryOut:
    db = auth.ctx.db
    program_institution = campus_institution = None
    if data.program_id is not None:
        program_institution = await db.scalar(select(Program.institution_id).where(Program.id == data.program_id))
        if program_institution is None:
            raise invalid("programId", "Invalid program")
    if data.campus_id is not None:
        campus_institution = await db.scalar(
            text("SELECT institution_id FROM campuses WHERE id = :id"), {"id": data.campus_id}
        )
        if campus_institution is None:
            raise invalid("campusId", "Invalid campus")
    staff = (
        await db.execute(
            text(
                "SELECT r.id, r.institution_id FROM role_profiles r JOIN users u "
                "ON u.person_id = r.person_id AND u.tenant_id = r.tenant_id "
                "WHERE u.id = :id AND r.kind = 'staff' ORDER BY r.id LIMIT 1"
            ),
            {"id": auth.ctx.user_id},
        )
    ).one_or_none()
    institution_id = program_institution or campus_institution or (staff.institution_id if staff else None)
    if institution_id is None:
        institution_id = await db.scalar(text("SELECT id FROM institutions ORDER BY id LIMIT 1"))
    if institution_id is None:
        raise ApiError(400, "invalid_request", "The request is not valid.")

    statement = (
        insert(Enquiry)
        .values(
            **data.model_dump(by_alias=False),
            id=new_id("enq").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
            institution_id=institution_id,
            assigned_staff_profile_id=staff.id if staff else None,
            status="new",
            campaign_code=None,
            lost_reason=None,
        )
        .returning(Enquiry)
    )
    enquiry = EnquiryOut.model_validate((await db.execute(statement)).scalar_one(), from_attributes=True)
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m12.enquiry.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="enquiry",
            target_id=enquiry.id,
            changes=changes(*data.model_dump(by_alias=True)),
        ),
    )
    return enquiry


async def application_page(db: AsyncSession, page: PageQuery, cipher: FieldCipher) -> Page[ApplicationOut]:
    total = await db.scalar(select(func.count()).select_from(Application))
    query = (
        select(Application).order_by(Application.list_order, Application.id).limit(page.page_size).offset(page.offset)
    )
    items: list[ApplicationOut] = []
    for row in await db.scalars(query):
        answers = dict(row.answers)
        try:
            if row.sensitive_answers is not None:
                private = await cipher.decrypt(
                    key_name(row.tenant_id, "tenant_data"), "applications.sensitive_answers", row.sensitive_answers
                )
                answers.update(_ANSWERS.validate_json(private))
            fields = {key: getattr(row, key) for key in ApplicationOut.model_fields if key != "answers"}
            items.append(ApplicationOut.model_validate({**fields, "answers": answers}))
        except ValidationError:
            raise ApiError(500, "internal", "Invalid stored application.") from None
    return Page.of(items, total or 0, page)
