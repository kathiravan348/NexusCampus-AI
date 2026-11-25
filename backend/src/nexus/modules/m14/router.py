"""Tenant-scoped M14 family reads."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, func, select

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.modules.m14.models import AuthorisedPickup, GuardianRelationship, Household
from nexus.modules.m14.schemas import AuthorisedPickupOut, GuardianRelationshipOut, HouseholdOut
from nexus.modules.m14.service import FamilyScope, family_scope, relationship_views, visible_people
from nexus.modules.m15.service import read_page
from nexus.modules.m83.keys import cipher_of

guard = Depends(require(None, "M14"), scope="function")
router = APIRouter(prefix="/api/v1", tags=["m14 families"], dependencies=[guard])
Viewer = Annotated[Authorized, guard]
Paging = Annotated[PageQuery, Depends(page_query)]
LearnerId = Annotated[str | None, Query(alias="learnerPersonId")]
Cipher = Annotated[FieldCipher, Depends(cipher_of)]


async def viewer_scope(auth: Viewer) -> FamilyScope:
    return await family_scope(auth)


Scope = Annotated[FamilyScope, Depends(viewer_scope, scope="function")]


async def learner_filter(scope: Scope, learner_id: LearnerId = None) -> Select[str]:
    return await visible_people(scope, learner_id)


People = Annotated[Select[str], Depends(learner_filter, scope="function")]


@router.get("/households")
async def households(scope: Scope, page: Paging) -> Page[HouseholdOut]:
    query = select(Household).order_by(Household.id)
    if scope.family_learners is not None:
        query = query.where(Household.learner_person_ids.overlap(sorted(scope.family_learners)))
    return await read_page(scope.auth.ctx.db, query, HouseholdOut, page)


@router.get("/guardian-relationships")
async def guardian_relationships(
    auth: Viewer, people: People, page: Paging, cipher: Cipher, learner_id: LearnerId = None
) -> Page[GuardianRelationshipOut]:
    query = select(GuardianRelationship).where(GuardianRelationship.learner_person_id.in_(people))
    db = auth.ctx.db
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = await db.scalars(query.order_by(GuardianRelationship.id).limit(page.page_size).offset(page.offset))
    items = await relationship_views(auth, rows.all(), cipher, learner_id)
    return Page.of(items, total or 0, page)


@router.get("/authorised-pickups")
async def authorised_pickups(auth: Viewer, people: People, page: Paging) -> Page[AuthorisedPickupOut]:
    query = select(AuthorisedPickup).where(AuthorisedPickup.learner_person_id.in_(people)).order_by(AuthorisedPickup.id)
    return await read_page(auth.ctx.db, query, AuthorisedPickupOut, page)
