import { PAGE_SIZE_MAX, PortabilityJobSchema, pageSchema } from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const PortabilityJobPageSchema = pageSchema(PortabilityJobSchema);

/** Tenant moves between SaaS and self-hosted or between regions (`ctl.portability.read`, P18). */
export function usePortabilityJobs() {
  return useControlQuery("/portability-jobs", PortabilityJobPageSchema, {
    pageSize: PAGE_SIZE_MAX,
  });
}
