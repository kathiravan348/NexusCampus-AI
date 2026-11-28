import {
  AccommodationSchema,
  GoalProgressSchema,
  SupportGoalSchema,
  SupportPlanSchema,
  SupportSessionSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const M = { module: "M38", permission: "m38.plan.read" } as const;

function m38Access(viewer: Viewer) {
  const { tenantId, personId, permissions } = viewer;
  const manage = permissions.has("m38.plan.manage");
  const staffIds = new Set(
    ofTenant(mockDb.roleProfiles, tenantId)
      .filter((row) => row.kind === "staff" && row.personId === personId)
      .map((row) => row.id),
  );
  const plans = ofTenant(mockDb.supportPlans, tenantId).filter(
    (plan) =>
      manage ||
      staffIds.has(plan.coordinatorStaffProfileId) ||
      plan.teamStaffProfileIds.some((id) => staffIds.has(id)),
  );
  const learnerIds = manage
    ? new Set(ofTenant(mockDb.learners, tenantId).map((row) => row.id))
    : new Set(plans.map((plan) => plan.learnerId));
  const checkLearner = (id: string) => {
    if (!learnerIds.has(id)) throw new ApiFailure("not_found");
  };
  const planById = (id: string | undefined) => found(plans.find((plan) => plan.id === id));
  return { plans, checkLearner, planById };
}

export const m38Handlers = [
  get("/support-plans", M, (ctx) => {
    const { plans, checkLearner } = m38Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = plans.filter((plan) => learnerId === null || plan.learnerId === learnerId);
    return list(ctx, rows, pageSchema(SupportPlanSchema));
  }),
  get("/support-plans/:id", M, (ctx) =>
    ok(SupportPlanSchema, m38Access(ctx.viewer).planById(ctx.params["id"])),
  ),
  get("/support-plans/:id/goals", M, (ctx) => {
    const plan = m38Access(ctx.viewer).planById(ctx.params["id"]);
    const rows = ofTenant(mockDb.supportGoals, ctx.viewer.tenantId).filter(
      (row) => row.planId === plan.id,
    );
    return list(ctx, rows, pageSchema(SupportGoalSchema));
  }),
  get("/support-plans/:id/accommodations", M, (ctx) => {
    const plan = m38Access(ctx.viewer).planById(ctx.params["id"]);
    const rows = ofTenant(mockDb.accommodations, ctx.viewer.tenantId).filter(
      (row) => row.planId === plan.id,
    );
    return list(ctx, rows, pageSchema(AccommodationSchema));
  }),
  get("/support-plans/:id/sessions", M, (ctx) => {
    const plan = m38Access(ctx.viewer).planById(ctx.params["id"]);
    const rows = ofTenant(mockDb.supportSessions, ctx.viewer.tenantId).filter(
      (row) => row.planId === plan.id,
    );
    return list(ctx, rows, pageSchema(SupportSessionSchema));
  }),
  get("/support-plans/:id/progress", M, (ctx) => {
    const plan = m38Access(ctx.viewer).planById(ctx.params["id"]);
    const goalIds = new Set(
      ofTenant(mockDb.supportGoals, ctx.viewer.tenantId)
        .filter((row) => row.planId === plan.id)
        .map((row) => row.id),
    );
    const rows = ofTenant(mockDb.goalProgress, ctx.viewer.tenantId).filter((row) =>
      goalIds.has(row.goalId),
    );
    return list(ctx, rows, pageSchema(GoalProgressSchema));
  }),
];
