"""Create and audit a definition within the caller's authorized tenant transaction."""

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.core.permissions import Authorized
from nexus.modules.m08.models import CustomFieldDefinition
from nexus.modules.m08.schemas import CustomFieldIn, CustomFieldOut


async def create_field(auth: Authorized, data: CustomFieldIn) -> CustomFieldOut:
    db = auth.ctx.db
    locale = await db.scalar(text("SELECT default_locale FROM institutions ORDER BY id LIMIT 1"))
    if not locale or locale not in data.label:
        detail = ApiErrorDetail(path="label", message="A label in the default locale is required")
        raise ApiError(400, "invalid_request", "The request is not valid.", [detail])

    fields = data.model_dump(exclude_unset=True, by_alias=True)
    statement = (
        insert(CustomFieldDefinition)
        .values(
            **fields,
            id=new_id("cf").replace("_", "-", 1),
            tenant_id=auth.ctx.tenant.tenant_id,
            archived=False,
        )
        .on_conflict_do_nothing(index_elements=["tenant_id", "entity", "key"])
        .returning(CustomFieldDefinition)
    )
    row = await db.scalar(statement)
    if row is None:
        raise ApiError(409, "conflict", "A field with this key already exists.")
    field = CustomFieldOut.model_validate(row, from_attributes=True)
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m08.customField.created",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="customField",
            target_id=field.id,
            changes=changes(*fields),
        ),
    )
    return field
