import { z } from "zod";
import {
  CountryCodeSchema,
  CurrencyCodeSchema,
  EmailSchema,
  IdSchema,
  InstitutionTypeSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  PhoneE164Schema,
  RegionSchema,
  UtcDateTimeSchema,
} from "../common";
import { hasNoDuplicates, notBefore } from "./shared";

/** How a customer buys and runs NexusCampus (REQUIREMENTS §9, D19). */
export const DeliveryModelSchema = z.enum([
  "saas_shared",
  "saas_dedicated",
  "self_hosted",
  "hybrid",
]);
export type DeliveryModel = z.infer<typeof DeliveryModelSchema>;

export const AccountStageSchema = z.enum(["lead", "trial", "customer", "churned"]);
export type AccountStage = z.infer<typeof AccountStageSchema>;

/**
 * A customer (P01). Metadata only (V-7): the institution name, type, country and region, the tenant ids we run
 * for it and a learner count — never its learners, families or staff.
 */
export const AccountSchema = z
  .strictObject({
    id: IdSchema,
    name: NameSchema,
    institutionType: InstitutionTypeSchema,
    country: CountryCodeSchema,
    region: RegionSchema,
    deliveryModel: DeliveryModelSchema,
    stage: AccountStageSchema,
    ownerStaffId: IdSchema,
    partnerId: IdSchema.nullable(),
    /** Tenants in our SaaS cells; empty for self-hosted (we only know their install, P06). */
    tenantIds: z.array(IdSchema),
    learnerCount: z.int().min(0),
    /** 0–100, from usage, support load and payments (P16). */
    healthScore: z.int().min(0).max(100),
    renewalDate: IsoDateSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((a) => hasNoDuplicates(a.tenantIds), {
    message: "tenantIds has duplicates",
    path: ["tenantIds"],
  })
  .refine((a) => a.deliveryModel !== "self_hosted" || a.tenantIds.length === 0, {
    message: "self-hosted accounts have no tenants in our cells",
    path: ["tenantIds"],
  });
export type Account = z.infer<typeof AccountSchema>;

export const ContactKindSchema = z.enum(["billing", "technical", "executive", "dpo"]);
export type ContactKind = z.infer<typeof ContactKindSchema>;

/** A commercial contact at the customer (their admin or finance person) — not a learner, family or staff record. */
export const AccountContactSchema = z.strictObject({
  id: IdSchema,
  accountId: IdSchema,
  name: NameSchema,
  workEmail: EmailSchema,
  phone: PhoneE164Schema.nullable(),
  kind: ContactKindSchema,
});
export type AccountContact = z.infer<typeof AccountContactSchema>;

export const OpportunityStageSchema = z.enum(["qualify", "proposal", "negotiation", "won", "lost"]);
export type OpportunityStage = z.infer<typeof OpportunityStageSchema>;

export const OpportunitySchema = z.strictObject({
  id: IdSchema,
  accountId: IdSchema,
  title: NameSchema,
  stage: OpportunityStageSchema,
  valueMinor: MinorUnitsSchema.min(0),
  currency: CurrencyCodeSchema,
  closeDate: IsoDateSchema,
  ownerStaffId: IdSchema,
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const AccountNoteSchema = z.strictObject({
  id: IdSchema,
  accountId: IdSchema,
  authorStaffId: IdSchema,
  body: z.string().trim().min(1).max(2000),
  createdAt: UtcDateTimeSchema,
});
export type AccountNote = z.infer<typeof AccountNoteSchema>;

export const ContractKindSchema = z.enum([
  "saas_subscription",
  "licence_perpetual",
  "licence_term",
  "support",
]);
export type ContractKind = z.infer<typeof ContractKindSchema>;

export const SlaTierSchema = z.enum(["standard", "priority", "enterprise"]);
export type SlaTier = z.infer<typeof SlaTierSchema>;

/** A signed agreement with a customer. Only a perpetual licence has no end date. */
export const ContractSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    kind: ContractKindSchema,
    startDate: IsoDateSchema,
    endDate: IsoDateSchema.nullable(),
    autoRenew: z.boolean(),
    valueMinor: MinorUnitsSchema.min(0),
    currency: CurrencyCodeSchema,
    slaTier: SlaTierSchema,
    status: z.enum(["draft", "active", "ended"]),
  })
  .refine((c) => (c.kind === "licence_perpetual") === (c.endDate === null), {
    message: "only a perpetual licence has no endDate",
    path: ["endDate"],
  })
  .refine((c) => c.endDate === null || notBefore(c.startDate, c.endDate), {
    message: "endDate must not be before startDate",
    path: ["endDate"],
  });
export type Contract = z.infer<typeof ContractSchema>;
