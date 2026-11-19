import { z } from "zod";
import { IdSchema, LocaleSchema, ModuleIdSchema, NameSchema, UtcDateTimeSchema } from "./common";

const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Modules AI may never read (A-3): health records and the data vault. */
export const AI_HARD_BLOCKED_MODULES = ["M61", "M83"] as const;
/** Safeguarding: AI off unless the institution switches it on after a privacy impact assessment (A-3). */
export const AI_SAFEGUARDING_MODULE = "M62";

/** What a feature asks the AI gateway for, instead of a vendor model id (D24, A-8). */
export const CapabilityTierSchema = z.enum([
  "fast",
  "balanced",
  "reasoning",
  "embedding",
  "multimodal",
]);
export type CapabilityTier = z.infer<typeof CapabilityTierSchema>;

export const AiProviderKindSchema = z.enum(["cloud", "local"]);
export type AiProviderKind = z.infer<typeof AiProviderKindSchema>;

/**
 * A tenant's AI switches (M11, D14, D24). PII redaction and the minor guardian-consent check are always on;
 * `M61` and `M83` are always blocked; safeguarding needs `safeguardingEnabled`. Never carries API keys.
 */
export const AiSettingsSchema = z
  .strictObject({
    tenantId: IdSchema,
    enabled: z.boolean(),
    modules: z.record(ModuleIdSchema, z.boolean()),
    blockedModules: z.array(ModuleIdSchema),
    safeguardingEnabled: z.boolean(),
    piiRedaction: z.literal(true),
    minorGuardianConsentRequired: z.literal(true),
    defaultTier: CapabilityTierSchema,
    provider: z.strictObject({ kind: AiProviderKindSchema, label: NameSchema }),
    updatedAt: UtcDateTimeSchema,
  })
  .refine((s) => hasNoDuplicates(s.blockedModules), {
    message: "blockedModules has duplicates",
    path: ["blockedModules"],
  })
  .refine((s) => AI_HARD_BLOCKED_MODULES.every((m) => s.blockedModules.includes(m)), {
    message: "blockedModules must include M61 (health) and M83 (vault)",
    path: ["blockedModules"],
  })
  .refine((s) => s.blockedModules.every((m) => s.modules[m] !== true), {
    message: "a blocked module cannot have AI switched on",
    path: ["modules"],
  })
  .refine((s) => s.safeguardingEnabled || s.modules[AI_SAFEGUARDING_MODULE] !== true, {
    message: "safeguarding AI needs safeguardingEnabled",
    path: ["modules", AI_SAFEGUARDING_MODULE],
  });
export type AiSettings = z.infer<typeof AiSettingsSchema>;

/** AI credits for one period (A-1). With `hardCap`, `used` never exceeds `granted`. */
export const AiCreditSchema = z
  .strictObject({
    tenantId: IdSchema,
    periodStart: UtcDateTimeSchema,
    periodEnd: UtcDateTimeSchema,
    granted: z.int().min(0),
    used: z.int().min(0),
    hardCap: z.boolean(),
  })
  .refine((c) => Date.parse(c.periodEnd) > Date.parse(c.periodStart), {
    message: "periodEnd must be after periodStart",
    path: ["periodEnd"],
  })
  .refine((c) => !c.hardCap || c.used <= c.granted, {
    message: "used exceeds granted under a hard cap",
    path: ["used"],
  });
export type AiCredit = z.infer<typeof AiCreditSchema>;

/** A record an answer was built from (A-5). `label` is display text in the answer's locale. */
export const AssistSourceSchema = z.strictObject({
  moduleId: ModuleIdSchema,
  recordType: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, { message: "Must be camelCase" }),
  recordId: IdSchema,
  label: z.string().trim().min(1).max(200),
});
export type AssistSource = z.infer<typeof AssistSourceSchema>;

/** An Assist answer: always labelled AI-generated and always with at least one source (A-5, AGENTS §7). */
export const AssistAnswerSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    question: z.string().trim().min(1).max(2000),
    answer: z.string().trim().min(1).max(20000),
    locale: LocaleSchema,
    aiGenerated: z.literal(true),
    sources: z.array(AssistSourceSchema).min(1),
    tier: CapabilityTierSchema,
    creditsUsed: z.int().min(0),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (a) =>
      a.sources.every((s) => !(AI_HARD_BLOCKED_MODULES as readonly string[]).includes(s.moduleId)),
    { message: "answers never cite health (M61) or vault (M83) records", path: ["sources"] },
  );
export type AssistAnswer = z.infer<typeof AssistAnswerSchema>;
