import {
  EntitlementSchema,
  PlanSchema,
  UsageMeterSchema,
  pageSchema,
  type Entitlement,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";
import { appendAudit, readBody, writeRoute } from "./write";

const M = "M05";
const PLAN_READ = "m05.plan.read";
/** Catalogue permission for switching optional modules (NEX-010 `m05.module.manage`). */
const MODULE_MANAGE = "m05.module.manage";

export const SetModuleInputSchema = z.strictObject({ enabled: z.boolean() });

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

  /**
   * Switch an optional module on or off (ideology §2.2: off = hidden, never broken).
   * Core modules → 409; a module the tenant is not entitled to at all → 403 `module_disabled`.
   */
  writeRoute(
    "patch",
    "/entitlements/:moduleId",
    { module: M, permission: MODULE_MANAGE },
    async (ctx) => {
      const { enabled } = await readBody(ctx.request, SetModuleInputSchema);
      const rows = mockDb.entitlements as Entitlement[];
      const row = rows.find(
        (e) => e.tenantId === ctx.viewer.tenantId && e.moduleId === ctx.params["moduleId"],
      );
      if (!row) throw new ApiFailure("module_disabled");
      if (row.source === "core") {
        throw new ApiFailure("conflict", [
          { path: "enabled", message: "Core modules are always on" },
        ]);
      }
      const updated = EntitlementSchema.parse({ ...row, enabled });
      rows[rows.indexOf(row)] = updated;
      await appendAudit(ctx.viewer, {
        module: M,
        action: `m05.module.${enabled ? "enabled" : "disabled"}`,
        targetType: "entitlement",
        targetId: updated.moduleId,
        fields: ["enabled"],
      });
      return ok(EntitlementSchema, updated);
    },
  ),
];
