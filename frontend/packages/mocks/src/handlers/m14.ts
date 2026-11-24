import {
  AuthorisedPickupSchema,
  GuardianRelationshipViewSchema,
  HouseholdSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, param, type RouteContext } from "./route";

const M = { module: "M14" } as const;
const READ = "m14.family.read";
const READ_RESTRICTED = "m14.family.read_restricted";

function familyScope(viewer: Viewer) {
  const learners = ofTenant(mockDb.learners, viewer.tenantId);
  const canReadAll = viewer.permissions.has(READ);
  const family = familyOf(viewer);
  const people = new Set(
    learners.filter((row) => canReadAll || family.has(row.personId)).map((row) => row.personId),
  );
  if (!canReadAll && people.size === 0) throw new ApiFailure("forbidden");
  return { canReadAll, people };
}

function matchesLearner(ctx: RouteContext) {
  const { people } = familyScope(ctx.viewer);
  const learnerPersonId = param(ctx.url, "learnerPersonId");
  if (learnerPersonId !== null) {
    found(people.has(learnerPersonId) ? learnerPersonId : undefined);
  }
  return (row: { learnerPersonId: string }) =>
    people.has(row.learnerPersonId) &&
    (learnerPersonId === null || row.learnerPersonId === learnerPersonId);
}

export const m14Handlers = [
  get("/households", M, (ctx) => {
    const { canReadAll, people } = familyScope(ctx.viewer);
    const households = ofTenant(mockDb.households, ctx.viewer.tenantId);
    return list(
      ctx,
      households.filter((row) => canReadAll || row.learnerPersonIds.some((id) => people.has(id))),
      pageSchema(HouseholdSchema),
    );
  }),
  get("/guardian-relationships", M, (ctx) => {
    const matches = matchesLearner(ctx);
    const showNote = ctx.viewer.permissions.has(READ_RESTRICTED);
    const relationships = ofTenant(mockDb.guardianRelationships, ctx.viewer.tenantId)
      .filter(matches)
      .map((row) => (showNote ? row : { ...row, courtOrderNote: null }));
    return list(ctx, relationships, pageSchema(GuardianRelationshipViewSchema));
  }),
  get("/authorised-pickups", M, (ctx) => {
    const matches = matchesLearner(ctx);
    const pickups = ofTenant(mockDb.authorisedPickups, ctx.viewer.tenantId).filter(matches);
    return list(ctx, pickups, pageSchema(AuthorisedPickupSchema));
  }),
];
