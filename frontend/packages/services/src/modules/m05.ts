import {
  EntitlementSchema,
  PAGE_SIZE_MAX,
  PlanSchema,
  UsageMeterSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

export const EntitlementPageSchema = pageSchema(EntitlementSchema);
export const UsageMeterPageSchema = pageSchema(UsageMeterSchema);

/** The tenant's plan (needs `m05.plan.read`). */
export function usePlan() {
  return useScopedQuery(queryKeys.m05.plan, (client, signal) =>
    client.get("/plan", PlanSchema, undefined, { signal }),
  );
}

/** Modules switched on for the tenant; drives the menu and the route guard. */
export function useEntitlements() {
  return useScopedQuery(queryKeys.m05.entitlements, (client, signal) =>
    client.get("/entitlements", EntitlementPageSchema, { pageSize: PAGE_SIZE_MAX }, { signal }),
  );
}

/** Usage meters this period (needs `m05.plan.read`). */
export function useUsage() {
  return useScopedQuery(queryKeys.m05.usage, (client, signal) =>
    client.get("/usage", UsageMeterPageSchema, { pageSize: PAGE_SIZE_MAX }, { signal }),
  );
}
