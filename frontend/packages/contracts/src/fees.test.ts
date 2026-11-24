import { describe, expect, it } from "vitest";
import {
  ConcessionSchema,
  FeeHeadSchema,
  FeeInvoiceSchema,
  FeePaymentSchema,
  FeePlanSchema,
  FeeRefundSchema,
  type Concession,
  type FeeHead,
  type FeeInvoice,
  type FeePayment,
  type FeePlan,
  type FeeRefund,
} from "./index";

const scope = { tenantId: "tenant-school", institutionId: "institution-school" };
const timestamps = { createdAt: "2026-04-01T08:00:00Z", updatedAt: "2026-04-02T08:00:00Z" };
const tuitionHead: FeeHead = {
  ...scope,
  id: "fee-head-tuition",
  code: "TUITION",
  name: "Tuition fee",
  taxRateBasisPoints: 0,
  refundable: false,
  active: true,
};
const labHead: FeeHead = {
  ...scope,
  id: "fee-head-lab",
  code: "LAB",
  name: "Science lab fee",
  taxRateBasisPoints: 1800,
  refundable: true,
  active: true,
};
const k12FeePlan: FeePlan = {
  ...scope,
  ...timestamps,
  id: "fee-plan-g5-2026",
  academicYearId: "calendar-2026",
  programId: "program-primary",
  yearLevelId: "grade-5",
  name: "Grade 5 Annual Fee Plan",
  currency: "INR",
  lines: [
    { feeHeadId: tuitionHead.id, amount: 6_000_000 },
    { feeHeadId: labHead.id, amount: 500_000 },
  ],
  instalments: [
    { code: "TERM-1", dueOn: "2026-04-15", sharePercentBasisPoints: 4000 },
    { code: "TERM-2", dueOn: "2026-08-15", sharePercentBasisPoints: 3000 },
    { code: "TERM-3", dueOn: "2026-12-15", sharePercentBasisPoints: 3000 },
  ],
};
const siblingConcession: Concession = {
  id: "concession-sibling-1",
  tenantId: scope.tenantId,
  learnerId: "learner-aarav",
  feePlanId: k12FeePlan.id,
  kind: "sibling",
  mode: "percent",
  value: 1000,
  reason: "Second child enrolled in Primary school",
  approvedByStaffProfileId: "staff-principal",
  validFrom: "2026-04-01",
  validTo: "2027-03-31",
  createdAt: "2026-04-01T09:00:00Z",
};
const issuedInvoice: FeeInvoice = {
  ...timestamps,
  id: "fee-inv-2026-001",
  tenantId: scope.tenantId,
  learnerId: "learner-aarav",
  invoiceNumber: "INV-2026-0001",
  currency: "INR",
  issuedOn: "2026-04-01",
  dueOn: "2026-04-15",
  lines: [
    {
      feeHeadId: tuitionHead.id,
      description: "Term 1 Tuition",
      amount: 2_400_000,
      discount: 240_000,
      tax: 0,
    },
    {
      feeHeadId: labHead.id,
      description: "Term 1 Lab",
      amount: 200_000,
      discount: 0,
      tax: 36_000,
    },
  ],
  total: 2_396_000,
  paid: 0,
  status: "issued",
};
const partPaidInvoice: FeeInvoice = {
  ...issuedInvoice,
  id: "fee-inv-2026-002",
  invoiceNumber: "INV-2026-0002",
  paid: 1_000_000,
  status: "part_paid",
};
const upiPayment: FeePayment = {
  id: "fee-pay-2026-001",
  tenantId: scope.tenantId,
  invoiceIds: [partPaidInvoice.id],
  payerPersonId: "person-parent-1",
  currency: "INR",
  amount: 1_000_000,
  method: "upi",
  gatewayReference: "UPI-410299384712",
  receiptNumber: "RCPT-2026-0001",
  receivedAt: "2026-04-05T10:30:00Z",
  status: "succeeded",
  deviceId: null,
};
const approvedRefund: FeeRefund = {
  id: "fee-ref-2026-001",
  tenantId: scope.tenantId,
  paymentId: upiPayment.id,
  amount: 100_000,
  reason: "Duplicate lab deposit collected",
  status: "approved",
  decidedByStaffProfileId: "staff-bursar",
  decidedAt: "2026-04-06T12:00:00Z",
  createdAt: "2026-04-06T09:00:00Z",
};

describe("FeeHead", () => {
  it("accepts refundable and non-refundable fee heads", () => {
    expect(FeeHeadSchema.parse(tuitionHead)).toEqual(tuitionHead);
    expect(FeeHeadSchema.parse(labHead)).toEqual(labHead);
  });

  it.each([-1, 10_001, 18.5])("rejects taxRateBasisPoints %s", (taxRateBasisPoints) => {
    const row = { ...labHead, taxRateBasisPoints };
    expect(FeeHeadSchema.safeParse(row).success).toBe(false);
  });
});

describe("FeePlan", () => {
  it("accepts an INR K12 fee plan with 3 instalments", () => {
    expect(FeePlanSchema.parse(k12FeePlan)).toEqual(k12FeePlan);
    const openPlan = { ...k12FeePlan, programId: null, yearLevelId: null };
    expect(FeePlanSchema.parse(openPlan)).toEqual(openPlan);
  });

  it("rejects instalment shares != 10000 and non-ascending dueOn", () => {
    const badShares = [
      { code: "TERM-1", dueOn: "2026-04-15", sharePercentBasisPoints: 4000 },
      { code: "TERM-2", dueOn: "2026-08-15", sharePercentBasisPoints: 3000 },
      { code: "TERM-3", dueOn: "2026-12-15", sharePercentBasisPoints: 2500 },
    ];
    const outOfOrder = [
      { code: "TERM-1", dueOn: "2026-08-15", sharePercentBasisPoints: 5000 },
      { code: "TERM-2", dueOn: "2026-04-15", sharePercentBasisPoints: 5000 },
    ];
    const sameDate = [
      { code: "TERM-1", dueOn: "2026-04-15", sharePercentBasisPoints: 5000 },
      { code: "TERM-2", dueOn: "2026-04-15", sharePercentBasisPoints: 5000 },
    ];
    for (const instalments of [badShares, outOfOrder, sameDate]) {
      const row = { ...k12FeePlan, instalments };
      expect(FeePlanSchema.safeParse(row).success).toBe(false);
    }
  });

  it("rejects duplicate fee heads and float line amounts", () => {
    const dupLines = [
      { feeHeadId: tuitionHead.id, amount: 3_000_000 },
      { feeHeadId: tuitionHead.id, amount: 3_000_000 },
    ];
    const floatLines = [{ feeHeadId: tuitionHead.id, amount: 1500.5 }];
    expect(FeePlanSchema.safeParse({ ...k12FeePlan, lines: dupLines }).success).toBe(false);
    expect(FeePlanSchema.safeParse({ ...k12FeePlan, lines: floatLines }).success).toBe(false);
  });
});

describe("Concession", () => {
  it("accepts a sibling percent concession and a fixed award credit", () => {
    expect(ConcessionSchema.parse(siblingConcession)).toEqual(siblingConcession);
    const fixed: Concession = {
      ...siblingConcession,
      kind: "award_credit",
      mode: "fixed",
      value: 500_000,
      approvedByStaffProfileId: null,
      validTo: null,
    };
    expect(ConcessionSchema.parse(fixed)).toEqual(fixed);
  });

  it("rejects invalid values and date windows", () => {
    for (const value of [10_001, 0, 12.5]) {
      expect(ConcessionSchema.safeParse({ ...siblingConcession, value }).success).toBe(false);
    }
    const badRange = { ...siblingConcession, validFrom: "2026-05-01", validTo: "2026-04-30" };
    expect(ConcessionSchema.safeParse(badRange).success).toBe(false);
  });
});

describe("FeeInvoice", () => {
  it("accepts issued, part-paid, paid and written-off invoices", () => {
    expect(FeeInvoiceSchema.parse(issuedInvoice)).toEqual(issuedInvoice);
    expect(FeeInvoiceSchema.parse(partPaidInvoice)).toEqual(partPaidInvoice);
    const paidInv = { ...issuedInvoice, paid: issuedInvoice.total, status: "paid" as const };
    expect(FeeInvoiceSchema.parse(paidInv)).toEqual(paidInv);
    const writtenOff = { ...partPaidInvoice, status: "written_off" as const };
    expect(FeeInvoiceSchema.parse(writtenOff)).toEqual(writtenOff);
  });

  it("rejects wrong total, paid > total, float amounts and status/paid mismatch", () => {
    const line = { feeHeadId: "fh-1", description: "T1", amount: 100, discount: 0, tax: 0 };
    const cases = [
      { ...issuedInvoice, total: 2_000_000 },
      { ...issuedInvoice, paid: issuedInvoice.total + 1, status: "paid" as const },
      { ...issuedInvoice, paid: 1_000_000, status: "paid" as const },
      { ...issuedInvoice, paid: 100, status: "issued" as const },
      { ...issuedInvoice, paid: 0, status: "part_paid" as const },
      { ...issuedInvoice, paid: issuedInvoice.total, status: "part_paid" as const },
      { ...issuedInvoice, dueOn: "2026-03-31" },
      { ...issuedInvoice, lines: [{ ...line, amount: 100.25 }], total: 100.25 },
      { ...issuedInvoice, lines: [{ ...line, discount: 101 }], total: 0 },
    ];
    for (const row of cases) {
      expect(FeeInvoiceSchema.safeParse(row).success).toBe(false);
    }
  });
});

describe("FeePayment and FeeRefund", () => {
  it("accepts UPI/offline payments and requested/approved refunds", () => {
    expect(FeePaymentSchema.parse(upiPayment)).toEqual(upiPayment);
    const offlineCash: FeePayment = {
      ...upiPayment,
      method: "cash",
      gatewayReference: null,
      deviceId: "device-front-desk-1",
    };
    expect(FeePaymentSchema.parse(offlineCash)).toEqual(offlineCash);
    expect(FeeRefundSchema.parse(approvedRefund)).toEqual(approvedRefund);
    const requested: FeeRefund = {
      ...approvedRefund,
      status: "requested",
      decidedByStaffProfileId: null,
      decidedAt: null,
    };
    expect(FeeRefundSchema.parse(requested)).toEqual(requested);
  });

  it("rejects invalid payments and refund decisions", () => {
    const dupInv = { ...upiPayment, invoiceIds: [partPaidInvoice.id, partPaidInvoice.id] };
    expect(FeePaymentSchema.safeParse(dupInv).success).toBe(false);
    expect(FeePaymentSchema.safeParse({ ...upiPayment, amount: 0 }).success).toBe(false);
    expect(FeePaymentSchema.safeParse({ ...upiPayment, amount: 99.5 }).success).toBe(false);
    expect(FeeRefundSchema.safeParse({ ...approvedRefund, amount: 0 }).success).toBe(false);
    const badRefunds = [
      { ...approvedRefund, decidedAt: null },
      { ...approvedRefund, decidedByStaffProfileId: null },
      { ...approvedRefund, status: "requested" as const },
      { ...approvedRefund, decidedAt: "2026-04-06T08:59:59Z" },
    ];
    for (const row of badRefunds) {
      expect(FeeRefundSchema.safeParse(row).success).toBe(false);
    }
  });
});

const allRecords = [
  { name: "FeeHead", schema: FeeHeadSchema, row: tuitionHead },
  { name: "FeePlan", schema: FeePlanSchema, row: k12FeePlan },
  { name: "Concession", schema: ConcessionSchema, row: siblingConcession },
  { name: "FeeInvoice", schema: FeeInvoiceSchema, row: issuedInvoice },
  { name: "FeePayment", schema: FeePaymentSchema, row: upiPayment },
  { name: "FeeRefund", schema: FeeRefundSchema, row: approvedRefund },
];

it.each(allRecords)("$name rejects extra keys and requires tenantId", ({ schema, row }) => {
  expect(schema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(schema.safeParse({ ...row, tenantId: undefined }).success).toBe(false);
});

describe.each([
  { name: "FeePlan", schema: FeePlanSchema, row: k12FeePlan },
  { name: "FeeInvoice", schema: FeeInvoiceSchema, row: issuedInvoice },
])("$name timestamp order", ({ schema, row }) => {
  it("compares instants with and without fractional seconds", () => {
    const createdAt = "2026-04-01T08:00:00.000Z";
    const sameInstant = { ...row, createdAt, updatedAt: "2026-04-01T08:00:00Z" };
    const earlier = { ...row, createdAt, updatedAt: "2026-04-01T07:59:59.999Z" };
    expect(schema.safeParse(sameInstant).success).toBe(true);
    expect(schema.safeParse(earlier).success).toBe(false);
  });
});
