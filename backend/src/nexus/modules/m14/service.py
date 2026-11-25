"""Resolve family visibility before filtering or paging and audit disclosed court notes."""

from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import ValidationError
from sqlalchemy import Select, select, text

from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.permissions import Authorized
from nexus.core.vault import key_name
from nexus.modules.m02.service import audit, family_of, not_found
from nexus.modules.m13.models import Learner
from nexus.modules.m14.models import GuardianRelationship
from nexus.modules.m14.schemas import GuardianRelationshipOut


@dataclass
class FamilyScope:
    auth: Authorized
    # None is tenant-wide access. A family scope contains only people with an M13 learner record.
    family_learners: set[str] | None


async def family_scope(auth: Authorized) -> FamilyScope:
    if auth.grants.has("m14.family.read"):
        return FamilyScope(auth, None)
    db = auth.ctx.db
    viewer = await db.scalar(text("SELECT person_id FROM users WHERE id = :id"), {"id": auth.ctx.user_id})
    family = await family_of(db, viewer) if viewer is not None else set()
    people = set(await db.scalars(select(Learner.person_id).where(Learner.person_id.in_(family))))
    if not people:
        raise ApiError(403, "forbidden", "You do not have permission for this.")
    return FamilyScope(auth, people)


async def visible_people(scope: FamilyScope, learner_id: str | None) -> Select[str]:
    people = select(Learner.person_id)
    if scope.family_learners is not None:
        people = people.where(Learner.person_id.in_(scope.family_learners))
    if learner_id is not None:
        people = people.where(Learner.person_id == learner_id)
        if not await scope.auth.ctx.db.scalar(select(people.exists())):
            raise not_found()
    return people


async def relationship_views(
    auth: Authorized, rows: Sequence[GuardianRelationship], cipher: FieldCipher, learner_id: str | None
) -> list[GuardianRelationshipOut]:
    restricted = auth.grants.has("m14.family.read_restricted")
    items: list[GuardianRelationshipOut] = []
    for row in rows:
        note = None
        if restricted and row.court_order_note is not None:
            note = await cipher.decrypt(
                key_name(row.tenant_id, "tenant_data"), "guardian_relationships.court_order_note", row.court_order_note
            )
        fields = {key: getattr(row, key) for key in GuardianRelationshipOut.model_fields if key != "court_order_note"}
        try:
            items.append(GuardianRelationshipOut.model_validate({**fields, "court_order_note": note}))
        except ValidationError:
            raise ApiError(500, "internal", "Invalid stored guardian relationship.") from None

    if any(item.court_order_note is not None for item in items):
        await audit(
            auth,
            "m14.guardianRelationship.sensitiveRead",
            "guardianRelationship",
            learner_id or "guardianRelationshipList",
            ["courtOrderNote"],
        )
    return items
