import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import {
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "./common";

/**
 * M18 Fees & payments contracts (D9, V-7).
 * Country tax rules, bank reconciliation and ERP export are server / later work.
 */

const NonNegativeMinorUnitsSchema = MinorUnitsSchema.min(0);
const PositiveMinorUnitsSchema = MinorUnitsSchema.min(1);

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

/** Chargeable fee head (tuition, lab, exam). Country tax rules are applied on the server. */
export const FeeHeadSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  institutionId: IdSchema,
  code: AcademicCodeSchema,
  name: NameSchema,
  taxRateBasisPoints: z.int().min(0).max(10_000),
  refundable: z.boolean(),
  active: z.boolean(),
});
export type FeeHead = z.infer<typeof FeeHeadSchema>;

export const FeePlanLineSchema = z.strictObject({
  feeHeadId: IdSchema,
  amount: NonNegativeMinorUnitsSchema,
});
export type FeePlanLine = z.infer<typeof FeePlanLineSchema>;

export const FeePlanInstalmentSchema = z.strictObject({
  code: AcademicCodeSchema,
  dueOn: IsoDateSchema,
  sharePercentBasisPoints: z.int().min(1).max(10_000),
});
export type FeePlanInstalment = z.infer<typeof FeePlanInstalmentSchema>;

function hasUniqueFeeHeads(plan: { lines: readonly FeePlanLine[] }): boolean {
  return new Set(plan.lines.map((line) => line.feeHeadId)).size === plan.lines.length;
}

function hasAscendingDueDates(plan: { instalments: readonly FeePlanInstalment[] }): boolean {
  for (let i = 1; i < plan.instalments.length; i += 1) {
    const previous = plan.instalments[i - 1];
    const current = plan.instalments[i];
    if (previous !== undefined && current !== undefined && current.dueOn <= previous.dueOn) {
      return false;
    }
  }
  return true;
}

function hasFullInstalmentShare(plan: { instalments: readonly FeePlanInstalment[] }): boolean {
  const total = plan.instalments.reduce((sum, item) => sum + item.sharePercentBasisPoints, 0);
  return total === 10_000;
}

/** Fee schedule for an academic year (optional program and year level), one currency per plan. */
export const FeePlanSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    academicYearId: IdSchema,
    programId: IdSchema.nullable(),
    yearLevelId: IdSchema.nullable(),
    name: NameSchema,
    currency: CurrencyCodeSchema,
    lines: z.array(FeePlanLineSchema).min(1).max(30),
    instalments: z.array(FeePlanInstalmentSchema).min(1).max(24),
    ...timestamps,
  })
  .refine(hasUniqueFeeHeads, {
    message: "lines has duplicate feeHeadId",
    path: ["lines"],
  })
  .refine(hasAscendingDueDates, {
    message: "instalment dueOn dates must be strictly ascending",
    path: ["instalments"],
  })
  .refine(hasFullInstalmentShare, {
    message: "instalment sharePercentBasisPoints must sum to 10000",
    path: ["instalments"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type FeePlan = z.infer<typeof FeePlanSchema>;

export const ConcessionKindSchema = z.enum([
  "sibling",
  "merit",
  "need_based",
  "staff_child",
  "scholarship",
  "award_credit",
  "other",
]);
export type ConcessionKind = z.infer<typeof ConcessionKindSchema>;

export const ConcessionModeSchema = z.enum(["percent", "fixed"]);
export type ConcessionMode = z.infer<typeof ConcessionModeSchema>;

/**
 * Discount, scholarship or award credit for a learner on a fee plan.
 * `reason` is personal data (V-7); keep it out of logs and restrict export.
 * For `fixed` mode, `value` is in minor units of the linked fee plan's currency.
 */
export const ConcessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    feePlanId: IdSchema,
    kind: ConcessionKindSchema,
    mode: ConcessionModeSchema,
    value: PositiveMinorUnitsSchema,
    /** Personal data (V-7); keep out of logs. */
    reason: z.string().trim().min(1).max(300),
    approvedByStaffProfileId: IdSchema.nullable(),
    validFrom: IsoDateSchema,
    validTo: IsoDateSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((row) => row.mode !== "percent" || row.value <= 10_000, {
    message: "percent concession value must be between 1 and 10000 basis points",
    path: ["value"],
  })
  .refine((row) => row.validTo === null || row.validTo >= row.validFrom, {
    message: "validTo is before validFrom",
    path: ["validTo"],
  });
export type Concession = z.infer<typeof ConcessionSchema>;

export const FeeInvoiceLineSchema = z
  .strictObject({
    feeHeadId: IdSchema,
    description: z.string().trim().min(1).max(120),
    amount: NonNegativeMinorUnitsSchema,
    discount: NonNegativeMinorUnitsSchema,
    tax: NonNegativeMinorUnitsSchema,
  })
  .refine((line) => line.discount <= line.amount, {
    message: "discount exceeds line amount",
    path: ["discount"],
  });
export type FeeInvoiceLine = z.infer<typeof FeeInvoiceLineSchema>;

export const FeeInvoiceStatusSchema = z.enum([
  "draft",
  "issued",
  "part_paid",
  "paid",
  "void",
  "written_off",
]);
export type FeeInvoiceStatus = z.infer<typeof FeeInvoiceStatusSchema>;

type InvoiceTotalCheck = { lines: readonly FeeInvoiceLine[]; total: number };
function invoiceTotalMatchesLines({ lines, total }: InvoiceTotalCheck): boolean {
  const sum = lines.reduce((acc, line) => acc + line.amount - line.discount + line.tax, 0);
  return total === sum;
}

type InvoiceStatusCheck = { status: FeeInvoiceStatus; paid: number; total: number };
function invoiceStatusMatchesPaid({ status, paid, total }: InvoiceStatusCheck): boolean {
  if (status === "issued") return paid === 0;
  if (status === "part_paid") return paid > 0 && paid < total;
  if (status === "paid") return paid === total;
  return true;
}

/** Learner fee invoice in one currency. Country tax calculation and dunning live on the server. */
export const FeeInvoiceSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    invoiceNumber: z.string().trim().min(1).max(40),
    currency: CurrencyCodeSchema,
    issuedOn: IsoDateSchema,
    dueOn: IsoDateSchema,
    lines: z.array(FeeInvoiceLineSchema).min(1).max(50),
    total: NonNegativeMinorUnitsSchema,
    paid: NonNegativeMinorUnitsSchema,
    status: FeeInvoiceStatusSchema,
    ...timestamps,
  })
  .refine((invoice) => invoice.dueOn >= invoice.issuedOn, {
    message: "dueOn is before issuedOn",
    path: ["dueOn"],
  })
  .refine(invoiceTotalMatchesLines, {
    message: "total does not match sum of lines (amount - discount + tax)",
    path: ["total"],
  })
  .refine((invoice) => invoice.paid <= invoice.total, {
    message: "paid exceeds total",
    path: ["paid"],
  })
  .refine(invoiceStatusMatchesPaid, {
    message: "status does not agree with paid amount",
    path: ["status"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type FeeInvoice = z.infer<typeof FeeInvoiceSchema>;

export const FeePaymentMethodSchema = z.enum([
  "cash",
  "cheque",
  "bank_transfer",
  "card",
  "upi",
  "wallet",
  "gateway",
]);
export type FeePaymentMethod = z.infer<typeof FeePaymentMethodSchema>;

export const FeePaymentStatusSchema = z.enum(["pending", "succeeded", "failed", "reversed"]);
export type FeePaymentStatus = z.infer<typeof FeePaymentStatusSchema>;

/** Payment against one or more fee invoices in one currency. Supports offline capture (M18 L2). */
export const FeePaymentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    invoiceIds: z.array(IdSchema).min(1).max(20),
    payerPersonId: IdSchema,
    currency: CurrencyCodeSchema,
    amount: PositiveMinorUnitsSchema,
    method: FeePaymentMethodSchema,
    /** Opaque gateway or transaction reference; never card numbers, CVV or bank secrets (V-7). */
    gatewayReference: z.string().trim().min(1).max(120).nullable(),
    receiptNumber: z.string().trim().min(1).max(40),
    receivedAt: UtcDateTimeSchema,
    status: FeePaymentStatusSchema,
    /** Device id when captured offline (M18 L2); null for online payments. */
    deviceId: IdSchema.nullable(),
  })
  .refine((payment) => new Set(payment.invoiceIds).size === payment.invoiceIds.length, {
    message: "invoiceIds has duplicates",
    path: ["invoiceIds"],
  });
export type FeePayment = z.infer<typeof FeePaymentSchema>;

export const FeeRefundStatusSchema = z.enum(["requested", "approved", "paid", "rejected"]);
export type FeeRefundStatus = z.infer<typeof FeeRefundStatusSchema>;

function validDecidedAt(r: { createdAt: string; decidedAt: string | null }): boolean {
  if (r.decidedAt === null) return true;
  return Date.parse(r.decidedAt) >= Date.parse(r.createdAt);
}

/** Refund against a fee payment, in minor units of the linked payment's currency. */
export const FeeRefundSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    paymentId: IdSchema,
    amount: PositiveMinorUnitsSchema,
    reason: z.string().trim().min(1).max(300),
    status: FeeRefundStatusSchema,
    decidedByStaffProfileId: IdSchema.nullable(),
    decidedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((r) => (r.status !== "requested") === (r.decidedByStaffProfileId !== null), {
    message: "decidedByStaffProfileId is set iff status is not requested",
    path: ["decidedByStaffProfileId"],
  })
  .refine((r) => (r.status !== "requested") === (r.decidedAt !== null), {
    message: "decidedAt is set iff status is not requested",
    path: ["decidedAt"],
  })
  .refine(validDecidedAt, {
    message: "decidedAt is before createdAt",
    path: ["decidedAt"],
  });
export type FeeRefund = z.infer<typeof FeeRefundSchema>;
