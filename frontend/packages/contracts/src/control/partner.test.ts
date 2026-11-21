import { describe, expect, it } from "vitest";
import { AccountHealthSchema, BusinessMetricsSchema } from "./metrics";
import { CommissionSchema, DealRegistrationSchema, PartnerSchema } from "./partner";
import { ImplementationProjectSchema } from "./project";
import {
  CertificationSchema,
  DpaRecordSchema,
  SecurityIncidentSchema,
  SubProcessorSchema,
} from "./trust";
import { rejects } from "./test-utils";

describe("Partner, DealRegistration, Commission", () => {
  it("accepts valid rows and rejects bad commission rates and paid without a date", () => {
    const partner = {
      id: "ptn_south",
      name: "Southern EdTech Partners",
      country: "IN",
      tier: "silver",
      commissionPct: 15,
      active: true,
      joinedAt: "2025-01-01T00:00:00Z",
    };
    expect(PartnerSchema.safeParse(partner).success).toBe(true);
    expect(
      DealRegistrationSchema.safeParse({
        id: "deal_1",
        partnerId: "ptn_south",
        accountId: "acc_lead",
        status: "approved",
        submittedAt: "2026-10-01T00:00:00Z",
        expiresAt: "2027-01-01",
      }).success,
    ).toBe(true);
    const commission = {
      id: "com_1",
      partnerId: "ptn_south",
      invoiceId: "inv_1",
      amountMinor: 650000,
      currency: "INR",
      status: "payable",
      paidAt: null,
    };
    expect(CommissionSchema.safeParse(commission).success).toBe(true);
    rejects(PartnerSchema, [{ ...partner, commissionPct: 60 }]);
    rejects(CommissionSchema, [{ ...commission, status: "paid" }]);
  });
});

describe("Trust operations", () => {
  const incident = {
    id: "inc_1",
    title: "Credential stuffing on sign-in",
    severity: "sev2",
    status: "resolved",
    affectedAccountIds: ["acc_riverside"],
    personalDataAffected: true,
    detectedAt: "2026-09-02T09:30:00Z",
    breachNotificationDueAt: "2026-09-02T15:30:00Z",
    notifiedAt: "2026-09-02T11:00:00Z",
    reportAiDrafted: true,
  };

  it("accepts valid rows", () => {
    expect(SecurityIncidentSchema.safeParse(incident).success).toBe(true);
    expect(
      SecurityIncidentSchema.safeParse({
        ...incident,
        personalDataAffected: false,
        breachNotificationDueAt: null,
        notifiedAt: null,
      }).success,
    ).toBe(true);
    expect(
      SubProcessorSchema.safeParse({
        id: "sp_aws",
        name: "Amazon Web Services",
        purpose: "Hosting in ap-south-1 and eu-central-1",
        country: "US",
        dpaSigned: true,
        touchesInstitutionData: true,
      }).success,
    ).toBe(true);
    expect(
      CertificationSchema.safeParse({
        id: "crt_1",
        code: "iso27001",
        status: "certified",
        validUntil: "2028-03-31",
      }).success,
    ).toBe(true);
    expect(
      DpaRecordSchema.safeParse({
        id: "dpa_1",
        accountId: "acc_apex",
        version: "2.1",
        signedAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects a breach without a deadline, a deadline before detection and lapsed dates", () => {
    rejects(SecurityIncidentSchema, [
      { ...incident, breachNotificationDueAt: null },
      { ...incident, breachNotificationDueAt: "2026-09-01T00:00:00Z" },
      { ...incident, personalDataAffected: false },
      { ...incident, affectedAccountIds: ["a", "a"] },
    ]);
    rejects(CertificationSchema, [
      { id: "crt_2", code: "soc2", status: "certified", validUntil: null },
      { id: "crt_3", code: "soc2", status: "planned", validUntil: "2028-01-01" },
    ]);
  });
});

describe("ImplementationProject", () => {
  const project = {
    id: "prj_1",
    accountId: "acc_northbridge",
    kind: "self_hosted_install",
    status: "in_progress",
    leadStaffId: "stf_priya",
    goLiveDate: "2026-12-15",
    tasks: [
      { title: "Hardware check", done: true, dueDate: "2026-11-10" },
      { title: "Install and licence", done: false, dueDate: "2026-11-30" },
    ],
    planAiDrafted: true,
    createdAt: "2026-11-01T00:00:00Z",
  };

  it("accepts a project and rejects going live with open tasks or no tasks", () => {
    expect(ImplementationProjectSchema.safeParse(project).success).toBe(true);
    rejects(ImplementationProjectSchema, [
      { ...project, status: "live" },
      { ...project, tasks: [] },
    ]);
  });
});

describe("BusinessMetrics and AccountHealth", () => {
  const metrics = {
    month: "2026-10",
    currency: "INR",
    mrrMinor: 250000000,
    arrMinor: 3000000000,
    activeAccounts: 412,
    newAccounts: 18,
    churnedAccounts: 3,
    grossChurnPct: 0.7,
    nrrPct: 108.5,
    openTickets: 37,
  };

  it("accepts metrics and rejects ARR that is not 12 × MRR", () => {
    expect(BusinessMetricsSchema.safeParse(metrics).success).toBe(true);
    rejects(BusinessMetricsSchema, [
      { ...metrics, arrMinor: 1 },
      { ...metrics, month: "2026-13" },
      { ...metrics, newAccounts: 500 },
    ]);
  });

  const health = {
    accountId: "acc_harmony",
    score: 38,
    churnRisk: "high",
    reasons: ["p16.reason.lowUsage", "p16.reason.overdueInvoice"],
    aiGenerated: true,
    computedAt: "2026-11-21T00:00:00Z",
  };

  it("accepts AI health with reasons and rejects inconsistent risk", () => {
    expect(AccountHealthSchema.safeParse(health).success).toBe(true);
    rejects(AccountHealthSchema, [
      { ...health, score: 80 },
      { ...health, churnRisk: "low" },
      { ...health, reasons: [] },
      { ...health, reasons: ["Low usage"] },
      { ...health, aiGenerated: false },
    ]);
  });
});
