import { DeploymentSchema, HealthSignalSchema, PAGE_SIZE_MAX, pageSchema } from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const DeploymentPageSchema = pageSchema(DeploymentSchema);
export const HealthSignalPageSchema = pageSchema(HealthSignalSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Every SaaS cell, dedicated cell, self-hosted install and Edge node (P06). */
export function useDeployments() {
  return useControlQuery("/deployments", DeploymentPageSchema, ALL);
}

/** Latest PII-free check-in per deployment (counts, rates, timings only — V-4). */
export function useHealthSignals() {
  return useControlQuery("/health-signals", HealthSignalPageSchema, ALL);
}
