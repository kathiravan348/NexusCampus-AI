import { z } from "zod";
import {
  CountryCodeSchema,
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "../common";

export const PartnerTierSchema = z.enum(["registered", "silver", "gold"]);
export type PartnerTier = z.infer<typeof PartnerTierSchema>;

/** A reseller or implementation partner (P12). */
export const PartnerSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  country: CountryCodeSchema,
  tier: PartnerTierSchema,
  commissionPct: z.number().min(0).max(50),
  active: z.boolean(),
  joinedAt: UtcDateTimeSchema,
});
export type Partner = z.infer<typeof PartnerSchema>;

/** A partner claims a prospect so two partners do not chase the same institution. */
export const DealRegistrationSchema = z.strictObject({
  id: IdSchema,
  partnerId: IdSchema,
  accountId: IdSchema,
  status: z.enum(["submitted", "approved", "rejected", "expired"]),
  submittedAt: UtcDateTimeSchema,
  expiresAt: IsoDateSchema,
});
export type DealRegistration = z.infer<typeof DealRegistrationSchema>;

/** Commission earned on a paid invoice of a partner-managed account. */
export const CommissionSchema = z
  .strictObject({
    id: IdSchema,
    partnerId: IdSchema,
    invoiceId: IdSchema,
    amountMinor: MinorUnitsSchema.min(0),
    currency: CurrencyCodeSchema,
    status: z.enum(["pending", "payable", "paid"]),
    paidAt: UtcDateTimeSchema.nullable(),
  })
  .refine((c) => (c.status === "paid") === (c.paidAt !== null), {
    message: "paidAt is set iff paid",
    path: ["paidAt"],
  });
export type Commission = z.infer<typeof CommissionSchema>;
