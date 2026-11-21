import type { CatalogueItem, Quote, QuoteLine, RegionalPrice } from "@nexus/contracts";
import { ACCOUNT, CATALOGUE, STAFF } from "./ids";

/** Tax rates the demo uses: India GST 18 %, UK VAT 20 %, US none, Singapore GST 9 %, Germany VAT 19 %. */
export const TAX_RATE_PCT = { IN: 18, GB: 20, US: 0, SG: 9, DE: 19 } as const;

const price = (
  country: keyof typeof TAX_RATE_PCT,
  currency: string,
  amountMinor: number,
): RegionalPrice => ({
  country,
  currency,
  amountMinor,
  taxRatePct: TAX_RATE_PCT[country],
});

const STAGE1 = ["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M10", "M83"];

/** What we sell (P02). Per-learner units for SaaS and licences (D52). */
export const CATALOGUE_ITEMS = [
  {
    id: CATALOGUE.starter,
    code: "starter",
    name: "Starter",
    kind: "saas_plan",
    modules: STAGE1,
    unit: "per_learner_month",
    credits: null,
    prices: [
      price("IN", "INR", 2900),
      price("GB", "GBP", 90),
      price("US", "USD", 120),
      price("SG", "SGD", 150),
      price("DE", "EUR", 110),
    ],
    active: true,
  },
  {
    id: CATALOGUE.standard,
    code: "standard",
    name: "Standard",
    kind: "saas_plan",
    modules: [...STAGE1, "M11"],
    unit: "per_learner_month",
    credits: null,
    prices: [
      price("IN", "INR", 4900),
      price("GB", "GBP", 150),
      price("US", "USD", 190),
      price("SG", "SGD", 230),
      price("DE", "EUR", 170),
    ],
    active: true,
  },
  {
    id: CATALOGUE.enterprise,
    code: "enterprise",
    name: "Enterprise",
    kind: "saas_plan",
    modules: [...STAGE1, "M11"],
    unit: "per_learner_month",
    credits: null,
    prices: [price("IN", "INR", 7900), price("GB", "GBP", 240), price("US", "USD", 300)],
    active: true,
  },
  {
    id: CATALOGUE.aiPlus,
    code: "ai-plus",
    name: "AI Plus",
    kind: "addon",
    modules: ["M11"],
    unit: "per_learner_month",
    credits: null,
    prices: [price("IN", "INR", 900), price("GB", "GBP", 30), price("US", "USD", 35)],
    active: true,
  },
  {
    id: CATALOGUE.messaging,
    code: "messaging",
    name: "SMS and WhatsApp bundle",
    kind: "addon",
    modules: ["M07"],
    unit: "flat_month",
    credits: null,
    prices: [price("IN", "INR", 150000)],
    active: true,
  },
  {
    id: CATALOGUE.dedicatedCell,
    code: "dedicated-cell",
    name: "Dedicated cell",
    kind: "addon",
    modules: [],
    unit: "flat_year",
    credits: null,
    prices: [
      price("US", "USD", 6000000),
      price("GB", "GBP", 4800000),
      price("IN", "INR", 400000000),
    ],
    active: true,
  },
  {
    id: CATALOGUE.ai10k,
    code: "ai-pack-10k",
    name: "AI credits 10,000",
    kind: "ai_credit_pack",
    modules: [],
    unit: "per_pack",
    credits: 10000,
    prices: [price("IN", "INR", 250000), price("GB", "GBP", 2500)],
    active: true,
  },
  {
    id: CATALOGUE.ai50k,
    code: "ai-pack-50k",
    name: "AI credits 50,000",
    kind: "ai_credit_pack",
    modules: [],
    unit: "per_pack",
    credits: 50000,
    prices: [price("IN", "INR", 1100000), price("GB", "GBP", 11000)],
    active: true,
  },
  {
    id: CATALOGUE.licStandard,
    code: "licence-standard",
    name: "Self-hosted Standard",
    kind: "licence_edition",
    modules: STAGE1,
    unit: "per_learner_year",
    credits: null,
    prices: [price("IN", "INR", 30000), price("DE", "EUR", 4000)],
    active: true,
  },
  {
    id: CATALOGUE.licEnterprise,
    code: "licence-enterprise",
    name: "Self-hosted Enterprise",
    kind: "licence_edition",
    modules: [...STAGE1, "M11"],
    unit: "per_learner_year",
    credits: null,
    prices: [price("IN", "INR", 50000), price("DE", "EUR", 6500)],
    active: true,
  },
  {
    id: CATALOGUE.supportPriority,
    code: "support-priority",
    name: "Priority support and updates",
    kind: "support",
    modules: [],
    unit: "flat_year",
    credits: null,
    prices: [price("IN", "INR", 30000000), price("DE", "EUR", 350000)],
    active: true,
  },
] satisfies readonly CatalogueItem[];

/** A quote line with its amount computed the same way the contract checks it. */
export const quoteLine = (
  itemId: string,
  quantity: number,
  unitAmountMinor: number,
  discountPct = 0,
): QuoteLine => ({
  itemId,
  quantity,
  unitAmountMinor,
  discountPct,
  amountMinor: Math.round(quantity * unitAmountMinor * (1 - discountPct / 100)),
});

const quote = (
  q: Omit<Quote, "subtotalMinor" | "taxMinor" | "totalMinor">,
  taxRatePct: number,
): Quote => {
  const subtotalMinor = q.lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const taxMinor = Math.round((subtotalMinor * taxRatePct) / 100);
  return { ...q, subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
};

export const QUOTES = [
  quote(
    {
      id: "quo-lt-1",
      accountId: ACCOUNT.lotus,
      number: "QUO-2026-00031",
      status: "sent",
      currency: "INR",
      // 300 learners × 12 months.
      lines: [quoteLine(CATALOGUE.standard, 3600, 4900)],
      validUntil: "2026-09-30",
      aiDrafted: false,
      createdByStaffId: STAFF.partnerUser,
      createdAt: "2026-09-05T06:00:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
  quote(
    {
      id: "quo-ax-ai",
      accountId: ACCOUNT.apex,
      number: "QUO-2026-00029",
      status: "draft",
      currency: "INR",
      lines: [quoteLine(CATALOGUE.ai50k, 10, 1100000)],
      validUntil: "2026-10-15",
      aiDrafted: true,
      createdByStaffId: STAFF.sales,
      createdAt: "2026-09-12T09:00:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
  quote(
    {
      id: "quo-sr-1",
      accountId: ACCOUNT.sunrise,
      number: "QUO-2026-00030",
      status: "draft",
      currency: "INR",
      // 120 learners × 12 months, 10 % first-year discount.
      lines: [quoteLine(CATALOGUE.standard, 1440, 4900, 10)],
      validUntil: "2026-10-14",
      aiDrafted: false,
      createdByStaffId: STAFF.sales,
      createdAt: "2026-09-14T06:00:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
] satisfies readonly Quote[];
