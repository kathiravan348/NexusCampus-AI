import {
  ImplementationProjectSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type ImplementationProject,
} from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const ProjectPageSchema = pageSchema(ImplementationProjectSchema);

/** Implementation projects (`ctl.project.read`, P15), optionally only one status. */
export function useProjects(status: ImplementationProject["status"] | null = null) {
  return useControlQuery("/projects", ProjectPageSchema, { pageSize: PAGE_SIZE_MAX, status });
}
