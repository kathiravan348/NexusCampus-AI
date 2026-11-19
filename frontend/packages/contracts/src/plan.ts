import { z } from "zod";
import { IdSchema, ModuleIdSchema, UtcDateTimeSchema } from "./common";
import { MessageKeySchema } from "./studio";

const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** A commercial plan (M05). `nameKey` is a message key, so plan names are translatable. */
export const PlanSchema = z
  .strictObject({
    id: IdSchema,
    code: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, {
      message: "Must be a lower-case slug, e.g. standard or enterprise-plus",
    }),
    nameKey: MessageKeySchema,
    modules: z.array(ModuleIdSchema),
    aiCreditsPerMonth: z.int().min(0),
    /** Null = no learner limit. */
    learnerLimit: z.int().min(1).nullable(),
  })
  .refine((p) => hasNoDuplicates(p.modules), {
    message: "modules has duplicates",
    path: ["modules"],
  });
export type Plan = z.infer<typeof PlanSchema>;

/** Why a tenant has a module: always-on `core`, its `plan`, a paid `addon`, or a time-limited `trial`. */
export const EntitlementSourceSchema = z.enum(["core", "plan", "addon", "trial"]);
export type EntitlementSource = z.infer<typeof EntitlementSourceSchema>;

/** A module switch for one tenant (ideology §2.2: off = hidden, never broken). */
export const EntitlementSchema = z
  .strictObject({
    tenantId: IdSchema,
    moduleId: ModuleIdSchema,
    enabled: z.boolean(),
    source: EntitlementSourceSchema,
    expiresAt: UtcDateTimeSchema.nullable(),
  })
  .refine((e) => e.source !== "core" || e.enabled, {
    message: "core modules cannot be switched off",
    path: ["enabled"],
  })
  .refine((e) => e.source !== "trial" || e.expiresAt !== null, {
    message: "a trial needs expiresAt",
    path: ["expiresAt"],
  });
export type Entitlement = z.infer<typeof EntitlementSchema>;

export const UsageMetricSchema = z.enum([
  "learners",
  "staff",
  "storage_bytes",
  "ai_credits",
  "sms",
  "email",
]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

/** Usage of one metric in one billing period. `limit: null` = unlimited; `used` may exceed `limit`. */
export const UsageMeterSchema = z
  .strictObject({
    tenantId: IdSchema,
    metric: UsageMetricSchema,
    used: z.int().min(0),
    limit: z.int().min(0).nullable(),
    periodStart: UtcDateTimeSchema,
    periodEnd: UtcDateTimeSchema,
  })
  .refine((u) => Date.parse(u.periodEnd) > Date.parse(u.periodStart), {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"],
  });
export type UsageMeter = z.infer<typeof UsageMeterSchema>;
