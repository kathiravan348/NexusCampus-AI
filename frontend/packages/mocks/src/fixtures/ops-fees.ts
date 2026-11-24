import type {
  Concession,
  FeeHead,
  FeeInvoice,
  FeePayment,
  FeePlan,
  FeeRefund,
} from "@nexus/contracts";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CALENDAR, INSTITUTION, PERSON, TENANT } from "./ids";
import {
  CONCESSION,
  FEE_HEAD,
  FEE_INVOICE,
  FEE_PAYMENT,
  FEE_PLAN,
  FEE_REFUND,
  type OpsTenantSlug,
  PROGRAM,
} from "./ids-stage3";
import { LEARNERS } from "./learner-records";
import { GUARDIAN_LINKS, ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, INSTITUTIONS, UPDATED_AT } from "./tenants";

export * from "./ops-fees-2";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

interface FeeTenantSpec {
  readonly slug: OpsTenantSlug;
  readonly programId: string;
  readonly prefix: string;
  readonly tenantId: string;
  readonly institutionId: string;
  readonly academicYearId: string;
  readonly adminPersonId: string;
  readonly annualTuition: number;
  readonly annualActivity: number;
}

const FEE_TENANT_SPECS: readonly FeeTenantSpec[] = [
  {
    slug: "ls",
    programId: PROGRAM.littleSteps,
    prefix: "LS",
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    academicYearId: CALENDAR.littleSteps,
    adminPersonId: PERSON.lsPriya,
    annualTuition: 1_200_000,
    annualActivity: 200_000,
  },
  {
    slug: "rv",
    programId: PROGRAM.riverside,
    prefix: "RV",
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    academicYearId: CALENDAR.riversideSchool,
    adminPersonId: PERSON.rvHelen,
    annualTuition: 240_000,
    annualActivity: 40_000,
  },
  {
    slug: "nb",
    programId: PROGRAM.northbridge,
    prefix: "NB",
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    academicYearId: CALENDAR.northbridge,
    adminPersonId: PERSON.nbRobert,
    annualTuition: 600_000,
    annualActivity: 100_000,
  },
  {
    slug: "ax",
    programId: PROGRAM.apex,
    prefix: "AX",
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    academicYearId: CALENDAR.apex,
    adminPersonId: PERSON.axKarthik,
    annualTuition: 800_000,
    annualActivity: 120_000,
  },
  {
    slug: "hm",
    programId: PROGRAM.harmony,
    prefix: "HM",
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    academicYearId: CALENDAR.harmony,
    adminPersonId: PERSON.hmWeiLing,
    annualTuition: 180_000,
    annualActivity: 20_000,
  },
];

const built = FEE_TENANT_SPECS.map((spec) => {
  const { slug, prefix, tenantId, institutionId, academicYearId } = spec;
  const institution = INSTITUTIONS.find((i) => i.id === institutionId);
  const calendar = ACADEMIC_CALENDARS.find((c) => c.id === academicYearId);
  const adminStaff = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === spec.adminPersonId && p.kind === "staff",
  );
  const [learnerOne, learnerTwo, learnerThree] = LEARNERS.filter((l) => l.tenantId === tenantId);
  if (!institution || !calendar || !adminStaff || !learnerOne || !learnerTwo || !learnerThree) {
    throw new Error(`Incomplete fee references for ${tenantId}`);
  }
  const currency = institution.locale.currency;
  const [tuitionHeadId, activityHeadId] = FEE_HEAD[slug];

  const feeHeads: FeeHead[] = [
    {
      id: tuitionHeadId,
      tenantId,
      institutionId,
      code: "TUITION",
      name: "Tuition fee",
      taxRateBasisPoints: 0,
      refundable: false,
      active: true,
    },
    {
      id: activityHeadId,
      tenantId,
      institutionId,
      code: "ACTIVITY",
      name: "Activity and lab fee",
      taxRateBasisPoints: 0,
      refundable: true,
      active: true,
    },
  ];

  const feePlan: FeePlan = {
    id: FEE_PLAN[slug],
    tenantId,
    institutionId,
    academicYearId,
    programId: spec.programId,
    yearLevelId: null,
    name: "Annual Standard Fee Plan",
    currency,
    lines: [
      { feeHeadId: tuitionHeadId, amount: spec.annualTuition },
      { feeHeadId: activityHeadId, amount: spec.annualActivity },
    ],
    instalments: [
      { code: "INST1", dueOn: "2026-09-15", sharePercentBasisPoints: 5000 },
      { code: "INST2", dueOn: "2026-12-10", sharePercentBasisPoints: 5000 },
    ],
    ...timestamps,
  };

  const concession: Concession = {
    id: CONCESSION[slug],
    tenantId,
    learnerId: learnerOne.id,
    feePlanId: feePlan.id,
    kind: slug === "ls" || slug === "rv" ? "sibling" : "merit",
    mode: "percent",
    value: 1000,
    reason: "Approved annual tuition concession.",
    approvedByStaffProfileId: adminStaff.id,
    validFrom: calendar.startsOn,
    validTo: calendar.endsOn,
    createdAt: CREATED_AT,
  };

  const tuitionHalf = spec.annualTuition / 2;
  const activityHalf = spec.annualActivity / 2;
  const instalmentTotal = tuitionHalf + activityHalf;
  const lines = [
    {
      feeHeadId: tuitionHeadId,
      description: "Term tuition instalment",
      amount: tuitionHalf,
      discount: 0,
      tax: 0,
    },
    {
      feeHeadId: activityHeadId,
      description: "Term activity fee",
      amount: activityHalf,
      discount: 0,
      tax: 0,
    },
  ];

  const [invPaidId, invPartId, invIssuedId] = FEE_INVOICE[slug];
  const invoices: FeeInvoice[] = [
    {
      id: invPaidId,
      tenantId,
      learnerId: learnerOne.id,
      invoiceNumber: `${prefix}-INV-2026-0001`,
      currency,
      issuedOn: "2026-09-05",
      dueOn: "2026-09-20",
      lines,
      total: instalmentTotal,
      paid: instalmentTotal,
      status: "paid",
      ...timestamps,
    },
    {
      id: invPartId,
      tenantId,
      learnerId: learnerTwo.id,
      invoiceNumber: `${prefix}-INV-2026-0002`,
      currency,
      issuedOn: "2026-09-05",
      dueOn: "2026-09-20",
      lines,
      total: instalmentTotal,
      paid: tuitionHalf,
      status: "part_paid",
      ...timestamps,
    },
    {
      id: invIssuedId,
      tenantId,
      learnerId: learnerThree.id,
      invoiceNumber: `${prefix}-INV-2026-0003`,
      currency,
      issuedOn: "2026-11-01",
      dueOn: "2026-11-30",
      lines,
      total: instalmentTotal,
      paid: 0,
      status: "issued",
      ...timestamps,
    },
  ];

  const payerOf = (personId: string): string => {
    const link = GUARDIAN_LINKS.find(
      (l) => l.tenantId === tenantId && l.learnerPersonId === personId,
    );
    return link?.guardianPersonId ?? personId;
  };

  const [payOneId, payTwoId] = FEE_PAYMENT[slug];
  const payments: FeePayment[] = [
    {
      id: payOneId,
      tenantId,
      invoiceIds: [invPaidId],
      payerPersonId: payerOf(learnerOne.personId),
      currency,
      amount: instalmentTotal,
      method: "bank_transfer",
      gatewayReference: `TXN-${prefix}-0001`,
      receiptNumber: `${prefix}-RCP-2026-0001`,
      receivedAt: "2026-09-12T10:15:00Z",
      status: "succeeded",
      deviceId: null,
    },
    {
      id: payTwoId,
      tenantId,
      invoiceIds: [invPartId],
      payerPersonId: payerOf(learnerTwo.personId),
      currency,
      amount: tuitionHalf,
      method: "card",
      gatewayReference: `TXN-${prefix}-0002`,
      receiptNumber: `${prefix}-RCP-2026-0002`,
      receivedAt: "2026-09-18T14:20:00Z",
      status: "succeeded",
      deviceId: null,
    },
  ];

  const refund: FeeRefund = {
    id: FEE_REFUND[slug],
    tenantId,
    paymentId: payOneId,
    amount: activityHalf,
    reason: "Activity schedule adjustment refund request.",
    status: "requested",
    decidedByStaffProfileId: null,
    decidedAt: null,
    createdAt: "2026-10-05T11:00:00Z",
  };
  return { feeHeads, feePlan, concession, invoices, payments, refund };
});

export const FEE_HEADS: readonly FeeHead[] = built.flatMap((f) => f.feeHeads);
export const FEE_PLANS: readonly FeePlan[] = built.map((f) => f.feePlan);
export const CONCESSIONS: readonly Concession[] = built.map((f) => f.concession);
export const FEE_INVOICES: readonly FeeInvoice[] = built.flatMap((f) => f.invoices);
export const FEE_PAYMENTS: readonly FeePayment[] = built.flatMap((f) => f.payments);
export const FEE_REFUNDS: readonly FeeRefund[] = built.map((f) => f.refund);
