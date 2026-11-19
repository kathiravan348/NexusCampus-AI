import { EntitlementSchema, PlanSchema, UsageMeterSchema, pageSchema } from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";

const M = "M05";
const PLAN_READ = "m05.plan.read";

export const m05Handlers = [
  get("/plan", { module: M, permission: PLAN_READ }, (ctx) => {
    const planId = mockDb.tenantPlans[ctx.viewer.tenantId];
    return ok(PlanSchema, found(mockDb.plans.find((p) => p.id === planId)));
  }),

  /** Every user: the app shell builds its menu from these (NEX-012). */
  get("/entitlements", { module: M }, (ctx) =>
    list(ctx, ofTenant(mockDb.entitlements, ctx.viewer.tenantId), pageSchema(EntitlementSchema)),
  ),

  get("/usage", { module: M, permission: PLAN_READ }, (ctx) =>
    list(ctx, ofTenant(mockDb.usageMeters, ctx.viewer.tenantId), pageSchema(UsageMeterSchema)),
  ),
];
