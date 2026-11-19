import type { AiCredit, AiSettings, AssistAnswer } from "@nexus/contracts";
import { CALENDAR, INSTITUTION, TENANT } from "./ids";
import { PLANS, TENANT_PLANS, USAGE_METERS } from "./plans";
import { UPDATED_AT } from "./tenants";

const BLOCKED = ["M61", "M62", "M83"];

const settings = (
  tenantId: string,
  enabled: boolean,
  provider: AiSettings["provider"],
  modules: AiSettings["modules"] = { M01: true, M02: true, M04: true, M07: true },
): AiSettings => ({
  tenantId,
  enabled,
  modules,
  blockedModules: BLOCKED,
  safeguardingEnabled: false,
  piiRedaction: true,
  minorGuardianConsentRequired: true,
  defaultTier: "balanced",
  provider,
  updatedAt: UPDATED_AT,
});

const CLOUD = { kind: "cloud", label: "Claude (Anthropic)" } as const;

/**
 * AI switches per tenant. AI is off wherever the M11 entitlement is not on: Little Steps (switched off)
 * and Harmony (Starter plan has no M11). Apex runs a local model on its own servers.
 */
export const AI_SETTINGS = [
  settings(TENANT.littleSteps, false, CLOUD, {}),
  settings(TENANT.riverside, true, CLOUD),
  settings(TENANT.northbridge, true, CLOUD, {
    M01: true,
    M02: true,
    M04: true,
    M06: true,
    M07: true,
  }),
  settings(TENANT.apex, true, { kind: "local", label: "On-premise model" }),
  settings(TENANT.harmony, false, CLOUD, {}),
] satisfies readonly AiSettings[];

const PERIOD_START = "2026-09-01T00:00:00Z";
const PERIOD_END = "2026-10-01T00:00:00Z";

const granted = (tenantId: string) =>
  PLANS.find((p) => p.id === TENANT_PLANS[tenantId])?.aiCreditsPerMonth ?? 0;

/** `used` is the `ai_credits` usage meter of the same period (D16: one number, one source). */
const used = (tenantId: string) =>
  USAGE_METERS.find((m) => m.tenantId === tenantId && m.metric === "ai_credits")?.used ?? 0;

const credit = (tenantId: string): AiCredit => ({
  tenantId,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  granted: granted(tenantId),
  used: used(tenantId),
  hardCap: true,
});

/** This period's AI credits; Apex is at 95 % of its grant. */
export const AI_CREDITS = [
  credit(TENANT.littleSteps),
  credit(TENANT.riverside),
  credit(TENANT.northbridge),
  credit(TENANT.apex),
  credit(TENANT.harmony),
] satisfies readonly AiCredit[];

/** Sample Assist answers in each AI-enabled tenant's default locale, each with sources. */
export const ASSIST_ANSWERS = [
  {
    id: "asa-rv-01",
    tenantId: TENANT.riverside,
    question: "When does the autumn term end?",
    answer:
      "The autumn term ends on Friday 18 December 2026. The spring term starts on 5 January 2027.",
    locale: "en-GB",
    aiGenerated: true,
    sources: [
      {
        moduleId: "M01",
        recordType: "academicCalendar",
        recordId: CALENDAR.riversideSchool,
        label: "Riverside School calendar 2026–27",
      },
    ],
    tier: "fast",
    creditsUsed: 1,
    createdAt: "2026-09-14T08:15:00Z",
  },
  {
    id: "asa-nb-01",
    tenantId: TENANT.northbridge,
    question: "Which time zone and currency does the university use?",
    answer: "Northbridge University uses Eastern Time (America/New_York) and US dollars.",
    locale: "en-US",
    aiGenerated: true,
    sources: [
      {
        moduleId: "M01",
        recordType: "institution",
        recordId: INSTITUTION.northbridge,
        label: "Northbridge University settings",
      },
    ],
    tier: "fast",
    creditsUsed: 1,
    createdAt: "2026-09-12T15:30:00Z",
  },
  {
    id: "asa-ax-01",
    tenantId: TENANT.apex,
    question: "متى تنتهي الدفعة الأولى؟",
    answer: "تنتهي الدفعة الأولى في 31 ديسمبر 2026، وتبدأ الدفعة الثانية في 10 يناير 2027.",
    locale: "ar-AE",
    aiGenerated: true,
    sources: [
      {
        moduleId: "M01",
        recordType: "academicCalendar",
        recordId: CALENDAR.apex,
        label: "التقويم الأكاديمي لمركز أبكس 2026–2027",
      },
    ],
    tier: "balanced",
    creditsUsed: 2,
    createdAt: "2026-09-15T09:40:00Z",
  },
] satisfies readonly AssistAnswer[];
