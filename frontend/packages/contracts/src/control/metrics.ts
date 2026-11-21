import { z } from "zod";
import { CurrencyCodeSchema, IdSchema, MinorUnitsSchema, UtcDateTimeSchema } from "../common";
import { MessageKeySchema } from "../studio";

/** Business numbers for one month in one reporting currency (P16). */
export const BusinessMetricsSchema = z
  .strictObject({
    /** `YYYY-MM`. */
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    currency: CurrencyCodeSchema,
    mrrMinor: MinorUnitsSchema.min(0),
    arrMinor: MinorUnitsSchema.min(0),
    activeAccounts: z.int().min(0),
    newAccounts: z.int().min(0),
    churnedAccounts: z.int().min(0),
    grossChurnPct: z.number().min(0).max(100),
    /** Net revenue retention; above 100 means expansion beats churn. */
    nrrPct: z.number().min(0).max(300),
    openTickets: z.int().min(0),
  })
  .refine((m) => m.arrMinor === m.mrrMinor * 12, {
    message: "arrMinor must be 12 × mrrMinor",
    path: ["arrMinor"],
  })
  .refine((m) => m.newAccounts <= m.activeAccounts, {
    message: "new accounts are part of active accounts",
    path: ["newAccounts"],
  });
export type BusinessMetrics = z.infer<typeof BusinessMetricsSchema>;

export const ChurnRiskSchema = z.enum(["low", "medium", "high"]);
export type ChurnRisk = z.infer<typeof ChurnRiskSchema>;

/**
 * AI-estimated account health (P16): a score, a risk level and the reasons as message keys (`p16.reason.*`), so
 * every number is explained. Labelled as AI; nobody acts on it without a person deciding.
 */
export const AccountHealthSchema = z
  .strictObject({
    accountId: IdSchema,
    score: z.int().min(0).max(100),
    churnRisk: ChurnRiskSchema,
    reasons: z.array(MessageKeySchema).min(1).max(5),
    aiGenerated: z.literal(true),
    computedAt: UtcDateTimeSchema,
  })
  .refine((h) => h.churnRisk !== "high" || h.score < 50, {
    message: "high churn risk needs a score below 50",
    path: ["churnRisk"],
  })
  .refine((h) => h.churnRisk !== "low" || h.score >= 70, {
    message: "low churn risk needs a score of 70 or more",
    path: ["churnRisk"],
  });
export type AccountHealth = z.infer<typeof AccountHealthSchema>;
