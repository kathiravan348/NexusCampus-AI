import { describe, expect, it } from "vitest";
import {
  CreditNoteSchema,
  DunningStateSchema,
  InvoiceSchema,
  PaymentSchema,
  SubscriptionSchema,
} from "./billing";
import { rejects } from "./test-utils";

const subscription = {
  id: "sub_1",
  accountId: "acc_apex",
  tenantId: "ten_apex",
  planItemId: "cat_standard",
  addonItemIds: ["cat_ai_plus"],
  status: "active",
  period: "annual",
  learners: 640,
  currentPeriodStart: "2026-06-01",
  currentPeriodEnd: "2027-05-31",
  trialEndsAt: null,
};

const invoice = {
  id: "inv_1",
  accountId: "acc_apex",
  number: "INV-2026-00042",
  status: "paid",
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  currency: "INR",
  taxScheme: "gst",
  lines: [
    {
      description: "Standard plan, 640 learners",
      itemId: "cat_standard",
      quantity: 640,
      amountMinor: 37632000,
    },
    { description: "Loyalty credit", itemId: null, quantity: 1, amountMinor: -632000 },
  ],
  subtotalMinor: 37000000,
  taxMinor: 6660000,
  totalMinor: 43660000,
  paidAt: "2026-06-10T06:00:00Z",
};

describe("Subscription", () => {
  it("accepts active and trialing subscriptions", () => {
    expect(SubscriptionSchema.safeParse(subscription).success).toBe(true);
    expect(
      SubscriptionSchema.safeParse({
        ...subscription,
        status: "trialing",
        trialEndsAt: "2026-06-30",
      }).success,
    ).toBe(true);
  });

  it("rejects trial dates outside a trial, periods ending early and duplicate add-ons", () => {
    rejects(SubscriptionSchema, [
      { ...subscription, trialEndsAt: "2026-06-30" },
      { ...subscription, status: "trialing" },
      { ...subscription, currentPeriodEnd: "2026-05-01" },
      { ...subscription, addonItemIds: ["a", "a"] },
    ]);
  });
});

describe("Invoice", () => {
  it("accepts an invoice with a credit line whose totals add up", () => {
    expect(InvoiceSchema.safeParse(invoice).success).toBe(true);
  });

  it("rejects bad totals, paidAt mismatch, due before issue and tax without a scheme", () => {
    rejects(InvoiceSchema, [
      { ...invoice, totalMinor: 1 },
      { ...invoice, status: "open" },
      { ...invoice, status: "open", paidAt: null, dueDate: "2026-05-01" },
      { ...invoice, taxScheme: "none" },
      { ...invoice, number: "42" },
    ]);
  });
});

describe("Payment, CreditNote, DunningState", () => {
  const payment = {
    id: "pay_1",
    invoiceId: "inv_1",
    amountMinor: 43660000,
    currency: "INR",
    method: "upi",
    gateway: "razorpay",
    gatewayRef: "pay_Nx12",
    status: "succeeded",
    createdAt: "2026-06-10T06:00:00Z",
  };

  it("accepts valid rows", () => {
    expect(PaymentSchema.safeParse(payment).success).toBe(true);
    expect(
      PaymentSchema.safeParse({
        ...payment,
        gateway: "manual",
        gatewayRef: null,
        method: "bank_transfer",
      }).success,
    ).toBe(true);
    expect(
      CreditNoteSchema.safeParse({
        id: "cn_1",
        invoiceId: "inv_1",
        number: "CN-2026-001",
        amountMinor: 100000,
        currency: "INR",
        reason: "Outage credit (SLA)",
        issuedAt: "2026-07-01T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      DunningStateSchema.safeParse({
        accountId: "acc_apex",
        stage: "reminder_1",
        overdueMinor: 5000,
        currency: "INR",
        nextStepAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a gateway payment without a reference and card details", () => {
    rejects(PaymentSchema, [
      { ...payment, gatewayRef: null },
      { ...payment, amountMinor: 0 },
      { ...payment, cardNumber: "4111111111111111" },
    ]);
  });
});
