"""Apply M13 family visibility before lookup and paging; audit only disclosed fields."""

from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Select, select, text

from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m02.service import audit, family_of, not_found
from nexus.modules.m08.models import CustomFieldDefinition
from nexus.modules.m13.models import Learner
from nexus.modules.m13.schemas import CustomFields, HealthFlag, LearnerOut

_FLAGS: TypeAdapter[list[HealthFlag]] = TypeAdapter(list[HealthFlag])
_PRIVATE_FIELDS: TypeAdapter[CustomFields] = TypeAdapter(CustomFields)


@dataclass
class LearnerAccess:
    auth: Authorized
    family: set[str]
    query: Select[tuple[Learner]]


async def learner_access(auth: Authorized) -> LearnerAccess:
    db = auth.ctx.db
    person_id = await db.scalar(text("SELECT person_id FROM users WHERE id = :id"), {"id": auth.ctx.user_id})
    family = await family_of(db, person_id) if person_id is not None else set()
    query = select(Learner)
    if not auth.grants.has("m13.learner.read"):
        query = query.where(Learner.person_id.in_(family))
        if not await db.scalar(select(query.exists())):
            raise ApiError(403, "forbidden", "You do not have permission for this.")
    return LearnerAccess(auth, family, query)


async def require_visible_id(access: LearnerAccess, learner_id: str) -> None:
    query = access.query.where(Learner.id == learner_id)
    if not await access.auth.ctx.db.scalar(select(query.exists())):
        raise not_found()


async def learner_records(
    access: LearnerAccess, rows: Sequence[Learner], cipher: FieldCipher, target: str
) -> list[LearnerOut]:
    auth = access.auth
    restricted = auth.grants.has("m13.learner.read_restricted")
    sensitive_keys = set(
        await auth.ctx.db.scalars(
            select(CustomFieldDefinition.key).where(
                CustomFieldDefinition.entity == "learner", CustomFieldDefinition.sensitive.is_(True)
            )
        )
    )
    fields_shown: set[str] = set()
    result: list[LearnerOut] = []
    for row in rows:
        family = row.person_id in access.family
        flags: list[HealthFlag] = []
        custom = dict(row.custom_fields)
        if restricted or family:
            protected_keys = sensitive_keys.intersection(custom)
            try:
                if row.health_flags is not None:
                    payload = await cipher.decrypt(
                        key_name(row.tenant_id, "field_health"), "learners.health_flags", row.health_flags
                    )
                    flags = _FLAGS.validate_json(payload)
                if row.sensitive_custom_fields is not None:
                    payload = await cipher.decrypt(
                        key_name(row.tenant_id, "tenant_data"),
                        "learners.sensitive_custom_fields",
                        row.sensitive_custom_fields,
                    )
                    private = _PRIVATE_FIELDS.validate_json(payload)
                    custom.update(private)
                    protected_keys.update(private)
            except ValidationError:
                raise ApiError(500, "internal", "Invalid stored learner record.") from None
            if not family:
                if flags:
                    fields_shown.add("healthFlags")
                if protected_keys:
                    fields_shown.add("customFields")
        else:
            custom = {key: value for key, value in custom.items() if key not in sensitive_keys}
        fields = {k: getattr(row, k) for k in LearnerOut.model_fields if k not in {"health_flags", "custom_fields"}}
        try:
            result.append(LearnerOut.model_validate({**fields, "health_flags": flags, "custom_fields": custom}))
        except ValidationError:
            raise ApiError(500, "internal", "Invalid stored learner record.") from None

    if fields_shown:
        await audit(auth, "m13.learner.sensitiveRead", "learner", target, sorted(fields_shown))
    return result
