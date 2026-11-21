import type {
  Commission,
  CreditNote,
  DunningState,
  Invoice,
  InvoiceLine,
  Payment,
  Subscription,
  UsageRecord,
} from "@nexus/contracts";
import { TENANT } from "../../fixtures/ids";
import { TAX_RATE_PCT } from "./commercial";
import { ACCOUNT, CATALOGUE, DEPLOYMENT, PARTNER } from "./ids";

/** SaaS subscriptions (P03). Amounts in the contracts are learners × price × 12. */
export const SUBSCRIPTIONS = [
  {
    id: "sub-ls",
    accountId: ACCOUNT.littleSteps,
    tenantId: TENANT.littleSteps,
    planItemId: CATALOGUE.starter,
    addonItemIds: [],
    status: "past_due",
    period: "monthly",
    learners: 180,
    currentPeriodStart: "2026-09-01",
    currentPeriodEnd: "2026-09-30",
    trialEndsAt: null,
  },
  {
    id: "sub-rv",
    accountId: ACCOUNT.riverside,
    tenantId: TENANT.riverside,
    planItemId: CATALOGUE.standard,
    addonItemIds: [],
    status: "active",
    period: "annual",
    learners: 1460,
    currentPeriodStart: "2026-04-01",
    currentPeriodEnd: "2027-03-31",
    trialEndsAt: null,
  },
  {
    id: "sub-nb",
    accountId: ACCOUNT.northbridge,
    tenantId: TENANT.northbridge,
    planItemId: CATALOGUE.enterprise,
    addonItemIds: [CATALOGUE.dedicatedCell],
    status: "active",
    period: "annual",
    learners: 9800,
    currentPeriodStart: "2026-07-01",
    currentPeriodEnd: "2027-06-30",
    trialEndsAt: null,
  },
  {
    id: "sub-ax",
    accountId: ACCOUNT.apex,
    tenantId: TENANT.apex,
    planItemId: CATALOGUE.standard,
    addonItemIds: [CATALOGUE.aiPlus],
    status: "active",
    period: "annual",
    learners: 640,
    currentPeriodStart: "2026-06-01",
    currentPeriodEnd: "2027-05-31",
    trialEndsAt: null,
  },
  {
    id: "sub-hm",
    accountId: ACCOUNT.harmony,
    tenantId: TENANT.harmony,
    planItemId: CATALOGUE.starter,
    addonItemIds: [],
    status: "trialing",
    period: "monthly",
    learners: 95,
    currentPeriodStart: "2026-08-20",
    currentPeriodEnd: "2026-09-19",
    trialEndsAt: "2026-09-19",
  },
  {
    id: "sub-sr",
    accountId: ACCOUNT.sunrise,
    tenantId: "ten-sr",
    planItemId: CATALOGUE.standard,
    addonItemIds: [],
    status: "trialing",
    period: "monthly",
    learners: 0,
    currentPeriodStart: "2026-09-14",
    currentPeriodEnd: "2026-10-13",
    trialEndsAt: "2026-10-13",
  },
] satisfies readonly Subscription[];

const line = (description: string, itemId: string | null, quantity: number, amountMinor: number) =>
  ({ description, itemId, quantity, amountMinor }) satisfies InvoiceLine;

/** An invoice whose subtotal, tax and total are computed from its lines (so they always add up). */
const invoice = (
  i: Omit<Invoice, "subtotalMinor" | "taxMinor" | "totalMinor">,
  taxRatePct: number,
): Invoice => {
  const subtotalMinor = i.lines.reduce((sum, l) => sum + l.amountMinor, 0);
  const taxMinor = Math.round((subtotalMinor * taxRatePct) / 100);
  return { ...i, subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
};

export const INVOICES = [
  invoice(
    {
      id: "inv-ls-08",
      accountId: ACCOUNT.littleSteps,
      number: "INV-2026-00071",
      status: "paid",
      issueDate: "2026-08-01",
      dueDate: "2026-08-08",
      currency: "INR",
      taxScheme: "gst",
      lines: [line("Starter, 180 learners, August", CATALOGUE.starter, 180, 522000)],
      paidAt: "2026-08-05T06:30:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
  invoice(
    {
      id: "inv-ls-09",
      accountId: ACCOUNT.littleSteps,
      number: "INV-2026-00088",
      status: "overdue",
      issueDate: "2026-09-01",
      dueDate: "2026-09-08",
      currency: "INR",
      taxScheme: "gst",
      lines: [line("Starter, 180 learners, September", CATALOGUE.starter, 180, 522000)],
      paidAt: null,
    },
    TAX_RATE_PCT.IN,
  ),
  invoice(
    {
      id: "inv-rv-26",
      accountId: ACCOUNT.riverside,
      number: "INV-2026-00040",
      status: "paid",
      issueDate: "2026-04-01",
      dueDate: "2026-04-30",
      currency: "GBP",
      taxScheme: "vat",
      lines: [line("Standard, 1,460 learners, 12 months", CATALOGUE.standard, 17520, 2628000)],
      paidAt: "2026-04-22T10:00:00Z",
    },
    TAX_RATE_PCT.GB,
  ),
  invoice(
    {
      id: "inv-nb-26",
      accountId: ACCOUNT.northbridge,
      number: "INV-2026-00062",
      status: "open",
      issueDate: "2026-07-01",
      dueDate: "2026-09-30",
      currency: "USD",
      taxScheme: "none",
      lines: [
        line("Enterprise, 9,800 learners, 12 months", CATALOGUE.enterprise, 117600, 35280000),
        line("Dedicated cell, 12 months", CATALOGUE.dedicatedCell, 1, 6000000),
      ],
      paidAt: null,
    },
    TAX_RATE_PCT.US,
  ),
  invoice(
    {
      id: "inv-ax-26",
      accountId: ACCOUNT.apex,
      number: "INV-2026-00051",
      status: "paid",
      issueDate: "2026-06-01",
      dueDate: "2026-06-15",
      currency: "INR",
      taxScheme: "gst",
      lines: [
        line("Standard, 640 learners, 12 months", CATALOGUE.standard, 7680, 37632000),
        line("AI Plus, 640 learners, 12 months", CATALOGUE.aiPlus, 7680, 6912000),
      ],
      paidAt: "2026-06-09T05:00:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
  invoice(
    {
      id: "inv-ct-26",
      accountId: ACCOUNT.coastal,
      number: "INV-2026-00021",
      status: "paid",
      issueDate: "2026-04-01",
      dueDate: "2026-04-30",
      currency: "INR",
      taxScheme: "gst",
      lines: [
        line(
          "Self-hosted Standard, 4,200 learners, 1 year",
          CATALOGUE.licStandard,
          4200,
          126000000,
        ),
        line("Priority support and updates, 1 year", CATALOGUE.supportPriority, 1, 30000000),
      ],
      paidAt: "2026-04-28T08:00:00Z",
    },
    TAX_RATE_PCT.IN,
  ),
  invoice(
    {
      id: "inv-al-lic",
      accountId: ACCOUNT.alpine,
      number: "INV-2025-00090",
      status: "paid",
      issueDate: "2025-12-01",
      dueDate: "2025-12-31",
      currency: "EUR",
      taxScheme: "vat",
      lines: [
        line(
          "Self-hosted Enterprise, 1,150 learners, perpetual",
          CATALOGUE.licEnterprise,
          1150,
          7475000,
        ),
      ],
      paidAt: "2025-12-20T09:00:00Z",
    },
    TAX_RATE_PCT.DE,
  ),
  invoice(
    {
      id: "inv-al-sup",
      accountId: ACCOUNT.alpine,
      number: "INV-2026-00002",
      status: "paid",
      issueDate: "2026-01-01",
      dueDate: "2026-01-31",
      currency: "EUR",
      taxScheme: "vat",
      lines: [line("Priority support and updates, 2026", CATALOGUE.supportPriority, 1, 350000)],
      paidAt: "2026-01-15T09:00:00Z",
    },
    TAX_RATE_PCT.DE,
  ),
] satisfies readonly Invoice[];

const totalOf = (invoiceId: string) => INVOICES.find((i) => i.id === invoiceId)?.totalMinor ?? 0;

const payment = (
  id: string,
  invoiceId: string,
  currency: string,
  method: Payment["method"],
  gateway: Payment["gateway"],
  status: Payment["status"],
  createdAt: string,
): Payment => ({
  id,
  invoiceId,
  amountMinor: totalOf(invoiceId),
  currency,
  method,
  gateway,
  gatewayRef:
    gateway === "manual" ? null : `${gateway === "razorpay" ? "pay" : "pi"}_${id.slice(4)}`,
  status,
  createdAt,
});

/** Payments carry the gateway reference only — never card or bank numbers. */
export const PAYMENTS = [
  payment("pay-ls-08", "inv-ls-08", "INR", "upi", "razorpay", "succeeded", "2026-08-05T06:30:00Z"),
  payment("pay-ls-09", "inv-ls-09", "INR", "upi", "razorpay", "failed", "2026-09-08T04:00:00Z"),
  payment(
    "pay-rv-26",
    "inv-rv-26",
    "GBP",
    "bank_transfer",
    "manual",
    "succeeded",
    "2026-04-22T10:00:00Z",
  ),
  payment(
    "pay-ax-26",
    "inv-ax-26",
    "INR",
    "netbanking",
    "razorpay",
    "succeeded",
    "2026-06-09T05:00:00Z",
  ),
  payment(
    "pay-ct-26",
    "inv-ct-26",
    "INR",
    "bank_transfer",
    "manual",
    "succeeded",
    "2026-04-28T08:00:00Z",
  ),
  payment("pay-al-lic", "inv-al-lic", "EUR", "card", "stripe", "succeeded", "2025-12-20T09:00:00Z"),
  payment("pay-al-sup", "inv-al-sup", "EUR", "card", "stripe", "succeeded", "2026-01-15T09:00:00Z"),
] satisfies readonly Payment[];

export const CREDIT_NOTES = [
  {
    id: "cn-rv-1",
    invoiceId: "inv-rv-26",
    number: "CN-2026-001",
    amountMinor: 30000,
    currency: "GBP",
    reason: "Service credit for the 3 July outage (priority SLA).",
    issuedAt: "2026-07-10T09:00:00Z",
  },
] satisfies readonly CreditNote[];

/** Little Steps is one reminder in after a failed UPI payment. Dunning ends at read-only, never deletion (D23). */
export const DUNNING_STATES = [
  {
    accountId: ACCOUNT.littleSteps,
    stage: "reminder_1",
    overdueMinor: totalOf("inv-ls-09"),
    currency: "INR",
    nextStepAt: "2026-09-18T00:00:00Z",
  },
  {
    accountId: ACCOUNT.northbridge,
    stage: "none",
    overdueMinor: 0,
    currency: "USD",
    nextStepAt: null,
  },
] satisfies readonly DunningState[];

const AUG = { periodStart: "2026-08-01T00:00:00Z", periodEnd: "2026-09-01T00:00:00Z" } as const;

const usage = (
  id: string,
  accountId: string,
  where: { tenantId: string } | { deploymentId: string },
  metric: UsageRecord["metric"],
  quantity: number,
  cap: number | null,
): UsageRecord => ({
  id,
  accountId,
  deploymentId: "deploymentId" in where ? where.deploymentId : null,
  tenantId: "tenantId" in where ? where.tenantId : null,
  metric,
  ...AUG,
  quantity,
  cap,
});

/** August usage (P11): counts only. The air-gapped Alpine install reports nothing (V-6). */
export const USAGE_RECORDS = [
  usage("use-ls-l", ACCOUNT.littleSteps, { tenantId: TENANT.littleSteps }, "learners", 180, null),
  usage("use-rv-l", ACCOUNT.riverside, { tenantId: TENANT.riverside }, "learners", 1460, null),
  usage("use-rv-ai", ACCOUNT.riverside, { tenantId: TENANT.riverside }, "ai_credits", 18200, 25000),
  usage("use-nb-l", ACCOUNT.northbridge, { tenantId: TENANT.northbridge }, "learners", 9800, null),
  usage(
    "use-nb-st",
    ACCOUNT.northbridge,
    { tenantId: TENANT.northbridge },
    "storage_gb",
    1840,
    2000,
  ),
  usage("use-ax-l", ACCOUNT.apex, { tenantId: TENANT.apex }, "learners", 640, null),
  usage("use-ax-ai", ACCOUNT.apex, { tenantId: TENANT.apex }, "ai_credits", 4750, 5000),
  usage("use-ax-msg", ACCOUNT.apex, { tenantId: TENANT.apex }, "messages", 21400, null),
  usage("use-hm-l", ACCOUNT.harmony, { tenantId: TENANT.harmony }, "learners", 95, 100),
  usage("use-ct-l", ACCOUNT.coastal, { deploymentId: DEPLOYMENT.coastal }, "learners", 4180, 4200),
  usage("use-ct-st", ACCOUNT.coastal, { deploymentId: DEPLOYMENT.coastal }, "staff", 312, null),
] satisfies readonly UsageRecord[];

/** Partner commissions on paid invoices of partner-managed accounts (P12). */
export const COMMISSIONS = [
  {
    id: "com-ax-26",
    partnerId: PARTNER.south,
    invoiceId: "inv-ax-26",
    amountMinor: 6681600,
    currency: "INR",
    status: "paid",
    paidAt: "2026-07-01T06:00:00Z",
  },
  {
    id: "com-al-lic",
    partnerId: PARTNER.euro,
    invoiceId: "inv-al-lic",
    amountMinor: 747500,
    currency: "EUR",
    status: "payable",
    paidAt: null,
  },
] satisfies readonly Commission[];
