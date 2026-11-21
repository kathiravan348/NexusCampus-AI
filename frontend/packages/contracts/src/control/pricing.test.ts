import { describe, expect, it } from "vitest";
import { CatalogueItemSchema, QuoteLineSchema, QuoteSchema } from "./pricing";
import { rejects } from "./test-utils";

const plan = {
  id: "cat_standard",
  code: "standard",
  name: "Standard",
  kind: "saas_plan",
  modules: ["M01", "M02", "M07"],
  unit: "per_learner_month",
  credits: null,
  prices: [
    { country: "IN", currency: "INR", amountMinor: 4900, taxRatePct: 18 },
    { country: "DE", currency: "EUR", amountMinor: 120, taxRatePct: 19 },
  ],
  active: true,
};

describe("CatalogueItem", () => {
  it("accepts a plan and an AI credit pack", () => {
    expect(CatalogueItemSchema.safeParse(plan).success).toBe(true);
    expect(
      CatalogueItemSchema.safeParse({
        ...plan,
        code: "ai-pack-10k",
        kind: "ai_credit_pack",
        modules: [],
        unit: "per_pack",
        credits: 10000,
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate countries, missing prices, credits on a plan and bad codes", () => {
    rejects(CatalogueItemSchema, [
      { ...plan, prices: [] },
      { ...plan, prices: [plan.prices[0], plan.prices[0]] },
      { ...plan, credits: 100 },
      { ...plan, kind: "ai_credit_pack" },
      { ...plan, code: "Standard Plan" },
      { ...plan, modules: ["M01", "M01"] },
    ]);
  });
});

const line = {
  itemId: "cat_standard",
  quantity: 100,
  unitAmountMinor: 4900,
  discountPct: 10,
  amountMinor: 441000,
};
const quote = {
  id: "quo_1",
  accountId: "acc_apex",
  number: "QUO-2026-00012",
  status: "draft",
  currency: "INR",
  lines: [line],
  subtotalMinor: 441000,
  taxMinor: 79380,
  totalMinor: 520380,
  validUntil: "2026-12-31",
  aiDrafted: true,
  createdByStaffId: "stf_arjun",
  createdAt: "2026-11-20T08:00:00Z",
};

describe("Quote", () => {
  it("accepts a quote whose totals add up", () => {
    expect(QuoteLineSchema.safeParse(line).success).toBe(true);
    expect(QuoteSchema.safeParse(quote).success).toBe(true);
  });

  it("rejects wrong line amounts, totals that do not add up, empty quotes and bad numbers", () => {
    rejects(QuoteLineSchema, [
      { ...line, amountMinor: 490000 },
      { ...line, discountPct: 101 },
    ]);
    rejects(QuoteSchema, [
      { ...quote, totalMinor: 520000 },
      { ...quote, subtotalMinor: 1 },
      { ...quote, lines: [] },
      { ...quote, number: "Q12" },
    ]);
  });
});
