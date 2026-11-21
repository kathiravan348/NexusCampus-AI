import {
  CommissionSchema,
  DealRegistrationSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useControlQuery } from "./hooks";
import { PartnerPageSchema } from "./p01";

export const DealPageSchema = pageSchema(DealRegistrationSchema);
export const CommissionPageSchema = pageSchema(CommissionSchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

/** Partners (`ctl.partner.read`); idle without the permission. */
export function usePartners(enabled = true) {
  return useControlQuery("/partners", PartnerPageSchema, ALL, { enabled });
}

/** Deal registrations (`ctl.deal.read`; partner users see their own accounts only). */
export function useDeals() {
  return useControlQuery("/deals", DealPageSchema, ALL);
}

/** Partner commissions (`ctl.partner.read`). */
export function useCommissions(enabled = true) {
  return useControlQuery("/commissions", CommissionPageSchema, ALL, { enabled });
}
