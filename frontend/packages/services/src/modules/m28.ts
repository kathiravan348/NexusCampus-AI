import { KpiSchema, RoleHomeSchema } from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const DashboardKpis = KpiSchema.array();

export function useRoleHome() {
  return useScopedQuery(queryKeys.m28.roleHome, (c, signal) =>
    c.get("/me/home", RoleHomeSchema, undefined, { signal }),
  );
}

export function useDashboardKpis() {
  return useScopedQuery(queryKeys.m28.dashboardKpis, (c, signal) =>
    c.get("/dashboards/kpis", DashboardKpis, undefined, { signal }),
  );
}
