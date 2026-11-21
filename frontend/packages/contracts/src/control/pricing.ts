import { z } from "zod";
import {
  CountryCodeSchema,
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  ModuleIdSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "../common";
import { ControlCodeSchema, DocumentNumberSchema, hasNoDuplicates, totalsMatch } from "./shared";

/** How a catalogue item is charged (P02, D52: learners are the unit for SaaS and licences). */
export const PriceUnitSchema = z.enum([
  "per_learner_month",
  "per_learner_year",
  "flat_month",
  "flat_year",
  "per_pack",
]);
export type PriceUnit = z.infer<typeof PriceUnitSchema>;

export const CatalogueItemKindSchema = z.enum([
  "saas_plan",
  "addon",
  "ai_credit_pack",
  "licence_edition",
  "support",
]);
export type CatalogueItemKind = z.infer<typeof CatalogueItemKindSchema>;

/** A price for one country: amount in minor units of `currency`, tax rate in percent (e.g. GST 18). */
export const RegionalPriceSchema = z.strictObject({
  country: CountryCodeSchema,
  currency: CurrencyCodeSchema,
  amountMinor: MinorUnitsSchema.min(0),
  taxRatePct: z.number().min(0).max(50),
});
export type RegionalPrice = z.infer<typeof RegionalPriceSchema>;

/** Something we sell: a SaaS plan, add-on, AI credit pack, licence edition or support contract (P02). */
export const CatalogueItemSchema = z
  .strictObject({
    id: IdSchema,
    code: ControlCodeSchema,
    name: NameSchema,
    kind: CatalogueItemKindSchema,
    modules: z.array(ModuleIdSchema),
    unit: PriceUnitSchema,
    /** AI credits in one pack; only for `ai_credit_pack`. */
    credits: z.int().min(1).nullable(),
    prices: z.array(RegionalPriceSchema).min(1),
    active: z.boolean(),
  })
  .refine((i) => hasNoDuplicates(i.modules), {
    message: "modules has duplicates",
    path: ["modules"],
  })
  .refine((i) => hasNoDuplicates(i.prices.map((p) => p.country)), {
    message: "one price per country",
    path: ["prices"],
  })
  .refine((i) => (i.kind === "ai_credit_pack") === (i.credits !== null), {
    message: "credits is set iff the item is an AI credit pack",
    path: ["credits"],
  });
export type CatalogueItem = z.infer<typeof CatalogueItemSchema>;

/** One quote line; `amountMinor` = quantity × unit price, less the discount, rounded to minor units. */
export const QuoteLineSchema = z
  .strictObject({
    itemId: IdSchema,
    quantity: z.int().min(1),
    unitAmountMinor: MinorUnitsSchema.min(0),
    discountPct: z.number().min(0).max(100),
    amountMinor: MinorUnitsSchema.min(0),
  })
  .refine(
    (l) => l.amountMinor === Math.round(l.quantity * l.unitAmountMinor * (1 - l.discountPct / 100)),
    {
      message: "amountMinor must equal quantity × unit price less discount",
      path: ["amountMinor"],
    },
  );
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

export const QuoteStatusSchema = z.enum(["draft", "sent", "accepted", "expired"]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

/** A priced offer to a customer (P02). `aiDrafted` marks a quote drafted by AI that a person must check. */
export const QuoteSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    number: DocumentNumberSchema,
    status: QuoteStatusSchema,
    currency: CurrencyCodeSchema,
    lines: z.array(QuoteLineSchema).min(1),
    subtotalMinor: MinorUnitsSchema.min(0),
    taxMinor: MinorUnitsSchema.min(0),
    totalMinor: MinorUnitsSchema.min(0),
    validUntil: IsoDateSchema,
    aiDrafted: z.boolean(),
    createdByStaffId: IdSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine(totalsMatch, {
    message: "lines, subtotal, tax and total do not add up",
    path: ["totalMinor"],
  });
export type Quote = z.infer<typeof QuoteSchema>;
