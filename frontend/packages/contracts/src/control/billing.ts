import { z } from "zod";
import {
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "../common";
import { DocumentNumberSchema, hasNoDuplicates, notBefore, totalsMatch } from "./shared";

export const SubscriptionStatusSchema = z.enum(["trialing", "active", "past_due", "cancelled"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingPeriodSchema = z.enum(["monthly", "annual"]);
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;

/** A SaaS subscription (P03): one plan, optional add-ons, billed per learner (D52). */
export const SubscriptionSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    tenantId: IdSchema,
    planItemId: IdSchema,
    addonItemIds: z.array(IdSchema),
    status: SubscriptionStatusSchema,
    period: BillingPeriodSchema,
    learners: z.int().min(0),
    currentPeriodStart: IsoDateSchema,
    currentPeriodEnd: IsoDateSchema,
    trialEndsAt: IsoDateSchema.nullable(),
  })
  .refine((s) => hasNoDuplicates(s.addonItemIds), {
    message: "addonItemIds has duplicates",
    path: ["addonItemIds"],
  })
  .refine((s) => notBefore(s.currentPeriodStart, s.currentPeriodEnd), {
    message: "currentPeriodEnd must not be before currentPeriodStart",
    path: ["currentPeriodEnd"],
  })
  .refine((s) => (s.status === "trialing") === (s.trialEndsAt !== null), {
    message: "trialEndsAt is set iff trialing",
    path: ["trialEndsAt"],
  });
export type Subscription = z.infer<typeof SubscriptionSchema>;

/** India GST, EU VAT, or none (export / exempt). Rules live in the billing engine (D51). */
export const TaxSchemeSchema = z.enum(["gst", "vat", "none"]);
export type TaxScheme = z.infer<typeof TaxSchemeSchema>;

export const InvoiceStatusSchema = z.enum(["draft", "open", "paid", "overdue", "void"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceLineSchema = z.strictObject({
  description: NameSchema,
  itemId: IdSchema.nullable(),
  quantity: z.int().min(1),
  amountMinor: MinorUnitsSchema,
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    number: DocumentNumberSchema,
    status: InvoiceStatusSchema,
    issueDate: IsoDateSchema,
    dueDate: IsoDateSchema,
    currency: CurrencyCodeSchema,
    taxScheme: TaxSchemeSchema,
    lines: z.array(InvoiceLineSchema).min(1),
    subtotalMinor: MinorUnitsSchema,
    taxMinor: MinorUnitsSchema.min(0),
    totalMinor: MinorUnitsSchema,
    paidAt: UtcDateTimeSchema.nullable(),
  })
  .refine(totalsMatch, {
    message: "lines, subtotal, tax and total do not add up",
    path: ["totalMinor"],
  })
  .refine((i) => notBefore(i.issueDate, i.dueDate), {
    message: "dueDate must not be before issueDate",
    path: ["dueDate"],
  })
  .refine((i) => (i.status === "paid") === (i.paidAt !== null), {
    message: "paidAt is set iff paid",
    path: ["paidAt"],
  })
  .refine((i) => i.taxScheme !== "none" || i.taxMinor === 0, {
    message: "no tax without a tax scheme",
    path: ["taxMinor"],
  });
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentMethodSchema = z.enum(["card", "upi", "netbanking", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** Gateways sit behind adapters (D51); `manual` = bank transfer we reconcile by hand. */
export const PaymentGatewaySchema = z.enum(["razorpay", "stripe", "manual"]);
export type PaymentGateway = z.infer<typeof PaymentGatewaySchema>;

/** A payment against an invoice. Never card numbers or bank details — only the gateway's reference. */
export const PaymentSchema = z
  .strictObject({
    id: IdSchema,
    invoiceId: IdSchema,
    amountMinor: MinorUnitsSchema.min(1),
    currency: CurrencyCodeSchema,
    method: PaymentMethodSchema,
    gateway: PaymentGatewaySchema,
    gatewayRef: z.string().min(1).max(128).nullable(),
    status: z.enum(["pending", "succeeded", "failed", "refunded"]),
    createdAt: UtcDateTimeSchema,
  })
  .refine((p) => p.gateway === "manual" || p.gatewayRef !== null, {
    message: "gateway payments need gatewayRef",
    path: ["gatewayRef"],
  });
export type Payment = z.infer<typeof PaymentSchema>;

export const CreditNoteSchema = z.strictObject({
  id: IdSchema,
  invoiceId: IdSchema,
  number: DocumentNumberSchema,
  amountMinor: MinorUnitsSchema.min(1),
  currency: CurrencyCodeSchema,
  reason: z.string().trim().min(1).max(500),
  issuedAt: UtcDateTimeSchema,
});
export type CreditNote = z.infer<typeof CreditNoteSchema>;

/** Where an overdue account is in the reminder sequence. Billing never deletes data (D23). */
export const DunningStageSchema = z.enum([
  "none",
  "reminder_1",
  "reminder_2",
  "final_notice",
  "read_only",
]);
export type DunningStage = z.infer<typeof DunningStageSchema>;

export const DunningStateSchema = z.strictObject({
  accountId: IdSchema,
  stage: DunningStageSchema,
  overdueMinor: MinorUnitsSchema.min(0),
  currency: CurrencyCodeSchema,
  nextStepAt: UtcDateTimeSchema.nullable(),
});
export type DunningState = z.infer<typeof DunningStateSchema>;
