import type {
  AccountHealth,
  BusinessMetrics,
  Certification,
  DealRegistration,
  DpaRecord,
  ImplementationProject,
  Partner,
  SecurityIncident,
  SubProcessor,
} from "@nexus/contracts";
import { ACCOUNT, PARTNER, STAFF } from "./ids";

export const PARTNERS = [
  {
    id: PARTNER.south,
    name: "Southern EdTech Partners",
    country: "IN",
    tier: "silver",
    commissionPct: 15,
    active: true,
    joinedAt: "2025-01-10T00:00:00Z",
  },
  {
    id: PARTNER.euro,
    name: "EuroLearn Solutions",
    country: "DE",
    tier: "registered",
    commissionPct: 10,
    active: true,
    joinedAt: "2025-09-01T00:00:00Z",
  },
] satisfies readonly Partner[];

export const DEAL_REGISTRATIONS = [
  {
    id: "deal-lt",
    partnerId: PARTNER.south,
    accountId: ACCOUNT.lotus,
    status: "approved",
    submittedAt: "2026-09-01T07:00:00Z",
    expiresAt: "2026-12-01",
  },
] satisfies readonly DealRegistration[];

/** Who processes data for us (P14). Only the cloud host can ever touch institution data, encrypted (V-2). */
export const SUB_PROCESSORS = [
  {
    id: "sp-aws",
    name: "Amazon Web Services",
    purpose:
      "Hosting in ap-south-1 (Mumbai) and eu-central-1 (Frankfurt); Claude via Bedrock in-region",
    country: "US",
    dpaSigned: true,
    touchesInstitutionData: true,
  },
  {
    id: "sp-razorpay",
    name: "Razorpay",
    purpose: "Card, UPI and net-banking payments for India",
    country: "IN",
    dpaSigned: true,
    touchesInstitutionData: false,
  },
  {
    id: "sp-stripe",
    name: "Stripe",
    purpose: "Card payments for Europe",
    country: "IE",
    dpaSigned: true,
    touchesInstitutionData: false,
  },
] satisfies readonly SubProcessor[];

export const CERTIFICATIONS = [
  { id: "crt-27001", code: "iso27001", status: "certified", validUntil: "2028-06-30" },
  { id: "crt-27701", code: "iso27701", status: "in_audit", validUntil: null },
  { id: "crt-soc2", code: "soc2", status: "planned", validUntil: null },
  { id: "crt-certin", code: "cert_in", status: "planned", validUntil: null },
] satisfies readonly Certification[];

export const SECURITY_INCIDENTS = [
  {
    id: "inc-0902",
    title: "Credential stuffing against Northbridge sign-in",
    severity: "sev2",
    status: "post_mortem_done",
    affectedAccountIds: [ACCOUNT.northbridge],
    personalDataAffected: false,
    detectedAt: "2026-09-02T03:00:00Z",
    breachNotificationDueAt: null,
    notifiedAt: null,
    reportAiDrafted: true,
  },
  {
    id: "inc-0703",
    title: "EU cell outage, 41 minutes",
    severity: "sev3",
    status: "resolved",
    affectedAccountIds: [ACCOUNT.riverside],
    personalDataAffected: false,
    detectedAt: "2026-07-03T08:12:00Z",
    breachNotificationDueAt: null,
    notifiedAt: null,
    reportAiDrafted: false,
  },
  {
    id: "inc-1015",
    title: "Report-card email sent to the wrong parent group",
    severity: "sev2",
    status: "resolved",
    affectedAccountIds: [ACCOUNT.sunrise],
    personalDataAffected: true,
    detectedAt: "2026-10-15T09:00:00Z",
    breachNotificationDueAt: "2026-10-18T09:00:00Z",
    notifiedAt: "2026-10-16T12:00:00Z",
    reportAiDrafted: true,
  },
] satisfies readonly SecurityIncident[];

export const DPA_RECORDS = [
  { id: "dpa-rv", accountId: ACCOUNT.riverside, version: "2.1", signedAt: "2026-03-20T00:00:00Z" },
  {
    id: "dpa-nb",
    accountId: ACCOUNT.northbridge,
    version: "2.1",
    signedAt: "2026-06-15T00:00:00Z",
  },
  { id: "dpa-ax", accountId: ACCOUNT.apex, version: "2.0", signedAt: "2025-05-28T00:00:00Z" },
  { id: "dpa-ct", accountId: ACCOUNT.coastal, version: "2.0", signedAt: "2025-03-10T00:00:00Z" },
] satisfies readonly DpaRecord[];

export const IMPLEMENTATION_PROJECTS = [
  {
    id: "prj-al",
    accountId: ACCOUNT.alpine,
    kind: "self_hosted_install",
    status: "live",
    leadStaffId: STAFF.implementation,
    goLiveDate: "2026-01-12",
    tasks: [
      { title: "Hardware and network check (air-gapped)", done: true, dueDate: "2025-12-10" },
      { title: "Install from offline bundle and load licence", done: true, dueDate: "2025-12-20" },
      { title: "Train admins on backups and updates", done: true, dueDate: "2026-01-09" },
    ],
    planAiDrafted: false,
    createdAt: "2025-11-20T00:00:00Z",
  },
  {
    id: "prj-sr",
    accountId: ACCOUNT.sunrise,
    kind: "onboarding",
    status: "in_progress",
    leadStaffId: STAFF.implementation,
    goLiveDate: "2026-10-01",
    tasks: [
      { title: "Set up institution profile and calendar", done: true, dueDate: "2026-09-16" },
      { title: "Invite teachers and import families", done: false, dueDate: "2026-09-23" },
      { title: "Theme and Tamil texts review", done: false, dueDate: "2026-09-28" },
    ],
    planAiDrafted: true,
    createdAt: "2026-09-14T06:00:00Z",
  },
  {
    id: "prj-rv-move",
    accountId: ACCOUNT.riverside,
    kind: "migration",
    status: "planned",
    leadStaffId: STAFF.implementation,
    goLiveDate: null,
    tasks: [
      { title: "Pre-flight check of the self-hosted move", done: false, dueDate: "2026-09-30" },
    ],
    planAiDrafted: true,
    createdAt: "2026-09-12T09:00:00Z",
  },
] satisfies readonly ImplementationProject[];

/** Twelve months of company metrics in INR (P16): steady growth, low churn. Deterministic for tests. */
export const BUSINESS_METRICS: readonly BusinessMetrics[] = Array.from({ length: 12 }, (_, i) => {
  const date = new Date(Date.UTC(2025, 8 + i, 1));
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const mrrMinor = 180_000_000 + i * 6_500_000;
  return {
    month,
    currency: "INR",
    mrrMinor,
    arrMinor: mrrMinor * 12,
    activeAccounts: 330 + i * 8,
    newAccounts: 10 + (i % 4),
    churnedAccounts: i % 3,
    grossChurnPct: Number(((i % 3) / 3.3).toFixed(2)),
    nrrPct: 104 + (i % 5),
    openTickets: 30 + (i % 7),
  };
});

const health = (
  accountId: string,
  score: number,
  churnRisk: AccountHealth["churnRisk"],
  reasons: string[],
): AccountHealth => ({
  accountId,
  score,
  churnRisk,
  reasons,
  aiGenerated: true,
  computedAt: "2026-09-15T00:00:00Z",
});

/** AI health estimates with their reasons (P16), labelled as AI. */
export const ACCOUNT_HEALTH = [
  health(ACCOUNT.littleSteps, 64, "medium", [
    "p16.reason.overdueInvoice",
    "p16.reason.steadyUsage",
  ]),
  health(ACCOUNT.riverside, 86, "low", ["p16.reason.growingUsage", "p16.reason.expansionWon"]),
  health(ACCOUNT.northbridge, 72, "low", ["p16.reason.steadyUsage", "p16.reason.recentIncident"]),
  health(ACCOUNT.apex, 91, "low", ["p16.reason.growingUsage", "p16.reason.highAiUse"]),
  health(ACCOUNT.harmony, 38, "high", ["p16.reason.lowUsage", "p16.reason.trialEndingSoon"]),
  health(ACCOUNT.coastal, 77, "low", ["p16.reason.nearLearnerCap", "p16.reason.openSlaBreach"]),
  health(ACCOUNT.alpine, 70, "medium", ["p16.reason.noTelemetry", "p16.reason.supportRenewalDue"]),
] satisfies readonly AccountHealth[];
