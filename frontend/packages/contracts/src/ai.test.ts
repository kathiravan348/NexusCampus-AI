import { describe, expect, it } from "vitest";
import { AiCreditSchema, AiSettingsSchema, AssistAnswerSchema } from "./ai";

const settings = {
  tenantId: "ten_apex",
  enabled: true,
  modules: { M01: true, M11: true, M62: false },
  blockedModules: ["M61", "M83"],
  safeguardingEnabled: false,
  piiRedaction: true,
  minorGuardianConsentRequired: true,
  defaultTier: "balanced",
  provider: { kind: "local", label: "On-premise model" },
  updatedAt: "2026-10-01T00:00:00Z",
};

const credit = {
  tenantId: "ten_apex",
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
  granted: 5000,
  used: 4750,
  hardCap: true,
};

const answer = {
  id: "asa_01",
  tenantId: "ten_apex",
  question: "كم عدد الطلاب في دفعة الهندسة؟",
  answer: "يوجد ٤٢ طالبًا في دفعة الهندسة.",
  locale: "ar-AE",
  aiGenerated: true,
  sources: [
    { moduleId: "M01", recordType: "campus", recordId: "cmp_apex_main", label: "الفرع الرئيسي" },
  ],
  tier: "fast",
  creditsUsed: 2,
  createdAt: "2026-11-18T10:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("AiSettings", () => {
  it("accepts settings, including safeguarding switched on after a PIA", () => {
    expect(AiSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      AiSettingsSchema.safeParse({
        ...settings,
        safeguardingEnabled: true,
        modules: { ...settings.modules, M62: true },
        blockedModules: ["M83", "M61", "M70"],
      }).success,
    ).toBe(true);
  });

  it("keeps the hard guards on", () => {
    rejects(AiSettingsSchema, [
      { ...settings, blockedModules: ["M83"] },
      { ...settings, blockedModules: ["M61"] },
      { ...settings, blockedModules: ["M61", "M83", "M61"] },
      { ...settings, modules: { M61: true } },
      { ...settings, modules: { M83: true } },
      { ...settings, modules: { M62: true } },
      { ...settings, piiRedaction: false },
      { ...settings, minorGuardianConsentRequired: false },
      { ...settings, defaultTier: "opus" },
      { ...settings, provider: { kind: "cloud", label: "Claude", apiKey: "x" } },
      { ...settings, modules: { m01: true } },
    ]);
  });
});

describe("AiCredit", () => {
  it("accepts credits and soft-cap overuse", () => {
    expect(AiCreditSchema.safeParse(credit).success).toBe(true);
    expect(AiCreditSchema.safeParse({ ...credit, hardCap: false, used: 5200 }).success).toBe(true);
  });

  it("rejects overuse under a hard cap and bad periods", () => {
    rejects(AiCreditSchema, [
      { ...credit, used: 5001 },
      { ...credit, used: -1 },
      { ...credit, periodEnd: credit.periodStart },
      { ...credit, granted: 1.5 },
    ]);
  });
});

describe("AssistAnswer", () => {
  it("accepts a sourced, AI-labelled answer", () => {
    expect(AssistAnswerSchema.safeParse(answer).success).toBe(true);
  });

  it("rejects unlabelled, unsourced and blocked-module answers", () => {
    rejects(AssistAnswerSchema, [
      { ...answer, aiGenerated: false },
      { ...answer, sources: [] },
      { ...answer, sources: [{ ...answer.sources[0], moduleId: "M61" }] },
      { ...answer, sources: [{ ...answer.sources[0], moduleId: "M83" }] },
      { ...answer, sources: [{ ...answer.sources[0], label: "" }] },
      { ...answer, answer: "" },
      { ...answer, tier: "best" },
      { ...answer, model: "claude-opus-5-5" },
    ]);
  });
});
