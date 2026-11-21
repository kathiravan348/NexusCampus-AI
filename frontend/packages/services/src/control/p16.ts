import {
  AccountHealthSchema,
  BusinessMetricsSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const BusinessMetricsPageSchema = pageSchema(BusinessMetricsSchema);
export const AccountHealthPageSchema = pageSchema(AccountHealthSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Monthly company numbers: MRR, ARR, customers, churn, retention, open tickets (`ctl.analytics.read`, P16). */
export function useBusinessMetrics() {
  return useControlQuery("/metrics", BusinessMetricsPageSchema, ALL);
}

/** AI health estimate per customer with its reasons (P16); a person decides what to do. */
export function useAccountHealth() {
  return useControlQuery("/account-health", AccountHealthPageSchema, ALL);
}
