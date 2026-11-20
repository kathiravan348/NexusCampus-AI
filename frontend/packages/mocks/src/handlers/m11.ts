import {
  AI_HARD_BLOCKED_MODULES,
  AiCreditSchema,
  AiSettingsSchema,
  AssistAnswerSchema,
  CapabilityTierSchema,
  LocaleSchema,
  ModuleIdSchema,
  pageSchema,
  type AiCredit,
  type AiSettings,
  type UsageMeter,
} from "@nexus/contracts";
import { z } from "zod";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { ASSIST_ANSWERS } from "../fixtures/ai";
import { found, get, list, ok } from "./route";
import { appendAudit, newId, readBody, writeRoute } from "./write";

const M = "M11";
const ASSIST_USE = "m11.assist.use";
const SETTINGS_MANAGE = "m11.settings.manage";

export const AskInputSchema = z.strictObject({
  question: z.string().trim().min(1).max(2000),
  locale: LocaleSchema,
});

/** `answer: null` = nothing in the institution's records matches (the reason is shown, no credit used). */
export const AskResponseSchema = z.strictObject({
  answer: AssistAnswerSchema.nullable(),
  credits: AiCreditSchema,
});

export const AiSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  modules: z.record(ModuleIdSchema, z.boolean()),
  safeguardingEnabled: z.boolean(),
  defaultTier: CapabilityTierSchema,
});

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{M}\p{N}]+/u) // \p{M}: Hindi and Tamil vowel signs belong to the word
      .filter((w) => w.length > 2),
  );

/** A minor learner of an early-years or K-12 institution needs a granted `ai_features` consent (G-6, A-4). */
function missingMinorConsent(viewer: Viewer): boolean {
  const person = mockDb.people.find((p) => p.id === viewer.personId);
  if (!person?.isMinor) return false;
  const institution = mockDb.institutions.find((i) => i.tenantId === viewer.tenantId);
  if (!institution || (institution.type !== "ey" && institution.type !== "k12")) return false;
  return !mockDb.consents.some(
    (c) =>
      c.tenantId === viewer.tenantId &&
      c.personId === viewer.personId &&
      c.purpose === "ai_features" &&
      c.status === "granted",
  );
}

function settingsOf(tenantId: string): AiSettings {
  return found(mockDb.aiSettings.find((s) => s.tenantId === tenantId));
}

function creditOf(tenantId: string): AiCredit {
  return found(mockDb.aiCredits.find((c) => c.tenantId === tenantId));
}

export const m11Handlers = [
  /** Assist users read it too: the panel shows the AI-off state from `enabled` (NEX-020). */
  get("/ai/settings", { module: M, permission: [ASSIST_USE, SETTINGS_MANAGE] }, (ctx) =>
    ok(AiSettingsSchema, settingsOf(ctx.viewer.tenantId)),
  ),

  get("/ai/credits", { module: M, permission: SETTINGS_MANAGE }, (ctx) =>
    list(ctx, ofTenant(mockDb.aiCredits, ctx.viewer.tenantId), pageSchema(AiCreditSchema)),
  ),

  /**
   * Mock Assist (no model call): the closest fixture answer by shared words, with sources. Refusals use
   * `details[0].path`: `ai_off` and `consent` (403 forbidden), `credits` (429 rate_limited).
   */
  writeRoute("post", "/assist/ask", { module: M, permission: ASSIST_USE }, async (ctx) => {
    const { tenantId } = ctx.viewer;
    const input = await readBody(ctx.request, AskInputSchema);
    if (!settingsOf(tenantId).enabled) {
      throw new ApiFailure("forbidden", [{ path: "ai_off", message: "AI is switched off" }]);
    }
    if (missingMinorConsent(ctx.viewer)) {
      throw new ApiFailure("forbidden", [
        { path: "consent", message: "A guardian has not consented to AI features" },
      ]);
    }
    const credit = creditOf(tenantId);
    if (credit.hardCap && credit.used >= credit.granted) {
      throw new ApiFailure("rate_limited", [{ path: "credits", message: "No AI credits left" }]);
    }

    const asked = words(input.question);
    let best: (typeof ASSIST_ANSWERS)[number] | null = null;
    let bestScore = 0;
    for (const a of ASSIST_ANSWERS.filter((x) => x.tenantId === tenantId)) {
      const score = [...words(a.question)].filter((w) => asked.has(w)).length;
      if (score > bestScore) {
        best = a;
        bestScore = score;
      }
    }
    if (!best) return ok(AskResponseSchema, { answer: null, credits: credit });

    const cost = Math.min(best.creditsUsed, credit.granted - credit.used);
    const credits = AiCreditSchema.parse({ ...credit, used: credit.used + cost });
    const rows = mockDb.aiCredits as AiCredit[];
    rows[rows.indexOf(credit)] = credits;
    const meter = (mockDb.usageMeters as UsageMeter[]).find(
      (m) => m.tenantId === tenantId && m.metric === "ai_credits",
    );
    if (meter) meter.used = credits.used;
    return ok(AskResponseSchema, {
      answer: {
        ...best,
        id: newId("asa"),
        question: input.question,
        creditsUsed: cost,
        createdAt: new Date().toISOString(),
      },
      credits,
    });
  }),

  /** Health (M61) and the vault (M83) can never be unblocked → 400; safeguarding needs its own switch. */
  writeRoute("put", "/ai/settings", { module: M, permission: SETTINGS_MANAGE }, async (ctx) => {
    const input = await readBody(ctx.request, AiSettingsInputSchema);
    const blocked = AI_HARD_BLOCKED_MODULES.filter((m) => input.modules[m] === true);
    if (blocked.length > 0) {
      throw new ApiFailure(
        "invalid_request",
        blocked.map((m) => ({ path: `modules.${m}`, message: `AI can never read ${m}` })),
      );
    }
    const rows = mockDb.aiSettings as AiSettings[];
    const current = settingsOf(ctx.viewer.tenantId);
    const blockedModules = input.safeguardingEnabled
      ? current.blockedModules.filter((m) => m !== "M62")
      : [...new Set([...current.blockedModules, "M62"])];
    const parsed = AiSettingsSchema.safeParse({
      ...current,
      ...input,
      blockedModules,
      updatedAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      throw new ApiFailure(
        "invalid_request",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    rows[rows.indexOf(current)] = parsed.data;
    await appendAudit(ctx.viewer, {
      module: M,
      action: "m11.settings.updated",
      targetType: "aiSettings",
      targetId: null,
      fields: ["enabled", "modules", "safeguardingEnabled", "defaultTier"],
    });
    return ok(AiSettingsSchema, parsed.data);
  }),
];
