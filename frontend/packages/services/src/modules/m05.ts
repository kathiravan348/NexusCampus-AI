import {
  EntitlementSchema,
  PAGE_SIZE_MAX,
  PlanSchema,
  UsageMeterSchema,
  pageSchema,
  type Entitlement,
  type ModuleId,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

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

/**
 * Switches an optional module on or off for the tenant (M05, L0 online-only). Refetches the
 * entitlements, so the shell menu and route guard update at once.
 */
export function useSetModuleEnabled() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<Entitlement, Error, { moduleId: ModuleId; enabled: boolean }>({
    mutationFn: ({ moduleId, enabled }) =>
      client.send(
        "PATCH",
        `/entitlements/${encodeURIComponent(moduleId)}`,
        { enabled },
        EntitlementSchema,
      ),
    onSuccess: async () => {
      if (session) await qc.invalidateQueries({ queryKey: queryKeys.m05.entitlements(session) });
    },
  });
}
