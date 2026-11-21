import { z } from "zod";
import { IdSchema, UtcDateTimeSchema } from "../common";

/** What we meter per tenant or install (P11) — counts only, never who. */
export const ControlUsageMetricSchema = z.enum([
  "learners",
  "staff",
  "storage_gb",
  "ai_credits",
  "messages",
]);
export type ControlUsageMetric = z.infer<typeof ControlUsageMetricSchema>;

/** One metered count for one period; feeds billing (P03) and licence caps (P05). `cap: null` = no cap. */
export const UsageRecordSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    deploymentId: IdSchema.nullable(),
    tenantId: IdSchema.nullable(),
    metric: ControlUsageMetricSchema,
    periodStart: UtcDateTimeSchema,
    periodEnd: UtcDateTimeSchema,
    quantity: z.int().min(0),
    cap: z.int().min(0).nullable(),
  })
  .refine((u) => u.deploymentId !== null || u.tenantId !== null, {
    message: "a usage record belongs to a tenant or a deployment",
    path: ["tenantId"],
  })
  .refine((u) => Date.parse(u.periodEnd) > Date.parse(u.periodStart), {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"],
  });
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
