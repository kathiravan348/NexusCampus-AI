import type { Entitlement, ModuleId, Plan, UsageMeter } from "@nexus/contracts";
import { PLAN, TENANT } from "./ids";
import { ROLE_PROFILES } from "./role-profiles";

/** Always-on modules (docs/MODULES.md "core"). */
export const CORE_MODULES: readonly ModuleId[] = [
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M83",
];
/** Optional Stage 1 modules a plan may include. */
const OPTIONAL: readonly ModuleId[] = ["M10", "M11"];

export const PLANS: readonly Plan[] = [
  {
    id: PLAN.starter,
    code: "starter",
    nameKey: "m05.plan.starter",
    modules: [],
    aiCreditsPerMonth: 0,
    learnerLimit: 100,
  },
  {
    id: PLAN.standard,
    code: "standard",
    nameKey: "m05.plan.standard",
    modules: ["M10", "M11"],
    aiCreditsPerMonth: 500,
    learnerLimit: 2000,
  },
  {
    id: PLAN.enterprise,
    code: "enterprise",
    nameKey: "m05.plan.enterprise",
    modules: ["M10", "M11"],
    aiCreditsPerMonth: 5000,
    learnerLimit: null,
  },
];

/** Which plan each demo tenant is on (no contract field yet; the services layer joins on it). */
export const TENANT_PLANS: Readonly<Record<string, string>> = {
  [TENANT.littleSteps]: PLAN.standard,
  [TENANT.riverside]: PLAN.enterprise,
  [TENANT.northbridge]: PLAN.enterprise,
  [TENANT.apex]: PLAN.standard,
  [TENANT.harmony]: PLAN.starter,
};

const TRIAL_ENDS = "2026-10-15T00:00:00Z";

const entitlementsFor = (tenantId: string): Entitlement[] => {
  const plan = PLANS.find((p) => p.id === TENANT_PLANS[tenantId]);
  const core: Entitlement[] = CORE_MODULES.map((moduleId) =>
    tenantId === TENANT.harmony && moduleId === "M07"
      ? { tenantId, moduleId, enabled: true, source: "trial", expiresAt: TRIAL_ENDS }
      : { tenantId, moduleId, enabled: true, source: "core", expiresAt: null },
  );
  const optional: Entitlement[] = OPTIONAL.filter((m) => plan?.modules.includes(m)).map(
    (moduleId) => ({
      tenantId,
      moduleId,
      // Little Steps keeps AI switched off although its plan includes it.
      enabled: !(tenantId === TENANT.littleSteps && moduleId === "M11"),
      source: "plan",
      expiresAt: null,
    }),
  );
  return [...core, ...optional];
};

/** Module switches per tenant: Little Steps has M11 off; Harmony has M07 on a trial. */
export const ENTITLEMENTS: readonly Entitlement[] =
  Object.keys(TENANT_PLANS).flatMap(entitlementsFor);

const PERIOD_START = "2026-09-01T00:00:00Z";
const PERIOD_END = "2026-10-01T00:00:00Z";

const count = (tenantId: string, kind: "learner" | "staff") =>
  ROLE_PROFILES.filter((r) => r.tenantId === tenantId && r.kind === kind).length;

/** Usage this period: learners and staff are counted from the fixtures (D16 totals match rows). */
const metersFor = (tenantId: string): UsageMeter[] => {
  const plan = PLANS.find((p) => p.id === TENANT_PLANS[tenantId]);
  const meter = (metric: UsageMeter["metric"], used: number, limit: number | null): UsageMeter => ({
    tenantId,
    metric,
    used,
    limit,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });
  const aiCredits = plan?.aiCreditsPerMonth ?? 0;
  // Apex is near its AI limit (95 %) so the M05/M11 screens can show the warning state.
  const aiUsed =
    tenantId === TENANT.littleSteps
      ? 0
      : tenantId === TENANT.apex
        ? Math.floor(aiCredits * 0.95)
        : Math.floor(aiCredits / 5);
  return [
    meter("learners", count(tenantId, "learner"), plan?.learnerLimit ?? null),
    meter("staff", count(tenantId, "staff"), null),
    meter("storage_bytes", 52_428_800, 10_737_418_240),
    meter("ai_credits", aiUsed, aiCredits),
    meter("email", 120, null),
  ];
};

export const USAGE_METERS: readonly UsageMeter[] = Object.keys(TENANT_PLANS).flatMap(metersFor);
