import { z } from "zod";
import { CurrencyCodeSchema, IdSchema, ModuleIdSchema, UtcDateTimeSchema } from "./common";
import { MessageKeySchema } from "./studio";

const hasNoDuplicates = (values: readonly string[]) => new Set(values).size === values.length;

export const HomeCardKindSchema = z.enum([
  "attendance",
  "fees",
  "results",
  "timetable",
  "messages",
  "notices",
  "consents",
  "pickups",
  "leave",
  "payslips",
  "tasks",
  "kpi",
  "alerts",
]);
export type HomeCardKind = z.infer<typeof HomeCardKindSchema>;

export const HomeCardSeveritySchema = z.enum(["info", "warning", "critical"]);
export type HomeCardSeverity = z.infer<typeof HomeCardSeveritySchema>;

/**
 * Summary card on a portal or dashboard home page (M25–M28).
 * Home cards and KPIs carry counts and aggregates only, never other people's personal data (G-6, V-7).
 */
export const HomeCardSchema = z.strictObject({
  kind: HomeCardKindSchema,
  titleKey: MessageKeySchema,
  moduleId: ModuleIdSchema,
  count: z.int().min(0).nullable(),
  severity: HomeCardSeveritySchema.nullable(),
  href: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[a-z0-9/-]*$/, {
      message: "Must be a lowercase app path starting with /, e.g. /attendance",
    }),
});
export type HomeCard = z.infer<typeof HomeCardSchema>;

export const RoleHomeRoleSchema = z.enum(["family", "learner", "staff", "leader"]);
export type RoleHomeRole = z.infer<typeof RoleHomeRoleSchema>;

/**
 * Portal home payload for family (M25), learner (M26), staff (M27) and leader (M28) roles.
 * `learnerIds` powers the child switcher for family / learner homes and is empty for staff / leader.
 * Home cards carry counts and aggregates only, never other people's personal data (G-6, V-7).
 */
export const RoleHomeSchema = z
  .strictObject({
    role: RoleHomeRoleSchema,
    personId: IdSchema,
    learnerIds: z.array(IdSchema).max(10),
    cards: z.array(HomeCardSchema).min(1).max(24),
    generatedAt: UtcDateTimeSchema,
  })
  .refine((home) => hasNoDuplicates(home.learnerIds), {
    message: "learnerIds has duplicates",
    path: ["learnerIds"],
  })
  .refine((h) => (h.role !== "staff" && h.role !== "leader") || h.learnerIds.length === 0, {
    message: "learnerIds must be empty for staff and leader homes",
    path: ["learnerIds"],
  });
export type RoleHome = z.infer<typeof RoleHomeSchema>;

export const KpiCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{2,39}$/, {
  message: "Must be a lowercase KPI code of 3–40 chars, e.g. fee_collected",
});
export type KpiCode = z.infer<typeof KpiCodeSchema>;

export const KpiUnitSchema = z.enum(["count", "percent", "minor_units", "days"]);
export type KpiUnit = z.infer<typeof KpiUnitSchema>;

export const KpiTrendSchema = z.enum(["up", "down", "flat"]);
export type KpiTrend = z.infer<typeof KpiTrendSchema>;

/**
 * Dashboard metric (M28).
 * Home cards and KPIs carry counts and aggregates only, never other people's personal data (G-6, V-7).
 */
export const KpiSchema = z
  .strictObject({
    code: KpiCodeSchema,
    labelKey: MessageKeySchema,
    value: z.number(),
    unit: KpiUnitSchema,
    currency: CurrencyCodeSchema.nullable(),
    trend: KpiTrendSchema.nullable(),
    asOf: UtcDateTimeSchema,
  })
  .refine((kpi) => (kpi.currency !== null) === (kpi.unit === "minor_units"), {
    message: "currency must be set iff unit is minor_units",
    path: ["currency"],
  })
  .refine((kpi) => kpi.unit !== "minor_units" || Number.isInteger(kpi.value), {
    message: "value must be an integer when unit is minor_units",
    path: ["value"],
  });
export type Kpi = z.infer<typeof KpiSchema>;

/** User-saved filter preset for a module view (M28). */
export const SavedViewSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    ownerPersonId: IdSchema,
    moduleId: ModuleIdSchema,
    name: z.string().trim().min(1).max(80),
    filters: z.record(z.string().min(1).max(64), z.string().max(200)),
    createdAt: UtcDateTimeSchema,
  })
  .refine((view) => Object.keys(view.filters).length <= 20, {
    message: "filters may have at most 20 keys",
    path: ["filters"],
  });
export type SavedView = z.infer<typeof SavedViewSchema>;
