import { PAGE_SIZE_MAX, SandboxSchema, pageSchema } from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const SandboxPageSchema = pageSchema(SandboxSchema);

/** Sales demos (synthetic data) and staging clones (masked copies) — `ctl.sandbox.read`, P17. */
export function useSandboxes() {
  return useControlQuery("/sandboxes", SandboxPageSchema, { pageSize: PAGE_SIZE_MAX });
}
