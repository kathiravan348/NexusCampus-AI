import { PAGE_SIZE_MAX, StaffUserSchema, pageSchema } from "@nexus/contracts";
import { useControlQuery } from "./hooks";

export const StaffPageSchema = pageSchema(StaffUserSchema);

/** Provider staff and partner users (`ctl.staff.read`, P13). */
export function useStaff() {
  return useControlQuery("/staff", StaffPageSchema, { pageSize: PAGE_SIZE_MAX });
}
