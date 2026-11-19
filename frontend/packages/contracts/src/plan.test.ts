import { describe, expect, it } from "vitest";
import { EntitlementSchema, PlanSchema, UsageMeterSchema } from "./plan";

const plan = {
  id: "pln_standard",
  code: "standard",
  nameKey: "m05.plan.standard",
  modules: ["M01", "M02", "M07", "M11"],
  aiCreditsPerMonth: 5000,
  learnerLimit: 2000,
};

const entitlement = {
  tenantId: "ten_harmony",
  moduleId: "M07",
  enabled: true,
  source: "trial",
  expiresAt: "2026-12-31T23:59:59Z",
};

const meter = {
  tenantId: "ten_harmony",
  metric: "ai_credits",
  used: 4750,
  limit: 5000,
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("Plan", () => {
  it("accepts a plan, including an unlimited one", () => {
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(
      PlanSchema.safeParse({ ...plan, code: "enterprise-plus", learnerLimit: null }).success,
    ).toBe(true);
  });

  it("rejects bad codes, keys, modules and limits", () => {
    rejects(PlanSchema, [
      { ...plan, code: "Standard" },
      { ...plan, nameKey: "Standard plan" },
      { ...plan, modules: ["M01", "M01"] },
      { ...plan, modules: ["X01"] },
      { ...plan, aiCreditsPerMonth: -1 },
      { ...plan, learnerLimit: 0 },
      { ...plan, price: 100 },
    ]);
  });
});

describe("Entitlement", () => {
  it("accepts trial, plan and core entitlements", () => {
    expect(EntitlementSchema.safeParse(entitlement).success).toBe(true);
    expect(
      EntitlementSchema.safeParse({
        ...entitlement,
        source: "plan",
        enabled: false,
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      EntitlementSchema.safeParse({
        ...entitlement,
        moduleId: "M01",
        source: "core",
        expiresAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a disabled core module, a trial without expiry, bad source", () => {
    rejects(EntitlementSchema, [
      { ...entitlement, moduleId: "M01", source: "core", enabled: false, expiresAt: null },
      { ...entitlement, expiresAt: null },
      { ...entitlement, source: "gift" },
      { ...entitlement, limits: {} },
    ]);
  });
});

describe("UsageMeter", () => {
  it("accepts limited, unlimited and over-limit usage", () => {
    expect(UsageMeterSchema.safeParse(meter).success).toBe(true);
    expect(UsageMeterSchema.safeParse({ ...meter, limit: null }).success).toBe(true);
    expect(UsageMeterSchema.safeParse({ ...meter, used: 5100 }).success).toBe(true);
  });

  it("rejects negative or fractional usage, bad metric and empty periods", () => {
    rejects(UsageMeterSchema, [
      { ...meter, used: -1 },
      { ...meter, used: 1.5 },
      { ...meter, limit: -5 },
      { ...meter, metric: "pages" },
      { ...meter, periodEnd: meter.periodStart },
      { ...meter, periodEnd: "2026-10-01T00:00:00Z" },
      { ...meter, cost: 0 },
    ]);
  });
});
