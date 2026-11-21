import * as C from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import { ACCESS_REQUESTS, BREAK_GLASS_NOTICES, TENANT } from "../fixtures";
import * as F from "./fixtures";

interface Parser {
  safeParse(value: unknown): { success: boolean; error?: unknown };
}

const SETS: [string, Parser, readonly unknown[]][] = [
  ["STAFF_USERS", C.StaffUserSchema, F.STAFF_USERS],
  ["ACCOUNTS", C.AccountSchema, F.ACCOUNTS],
  ["ACCOUNT_CONTACTS", C.AccountContactSchema, F.ACCOUNT_CONTACTS],
  ["OPPORTUNITIES", C.OpportunitySchema, F.OPPORTUNITIES],
  ["ACCOUNT_NOTES", C.AccountNoteSchema, F.ACCOUNT_NOTES],
  ["CONTRACTS", C.ContractSchema, F.CONTRACTS],
  ["CATALOGUE_ITEMS", C.CatalogueItemSchema, F.CATALOGUE_ITEMS],
  ["QUOTES", C.QuoteSchema, F.QUOTES],
  ["SUBSCRIPTIONS", C.SubscriptionSchema, F.SUBSCRIPTIONS],
  ["INVOICES", C.InvoiceSchema, F.INVOICES],
  ["PAYMENTS", C.PaymentSchema, F.PAYMENTS],
  ["CREDIT_NOTES", C.CreditNoteSchema, F.CREDIT_NOTES],
  ["DUNNING_STATES", C.DunningStateSchema, F.DUNNING_STATES],
  ["USAGE_RECORDS", C.UsageRecordSchema, F.USAGE_RECORDS],
  ["COMMISSIONS", C.CommissionSchema, F.COMMISSIONS],
  ["DEPLOYMENTS", C.DeploymentSchema, F.DEPLOYMENTS],
  ["HEALTH_SIGNALS", C.HealthSignalSchema, F.HEALTH_SIGNALS],
  ["RELEASES", C.ReleaseSchema, F.RELEASES],
  ["ROLLOUTS", C.RolloutSchema, F.ROLLOUTS],
  ["EXTENSIONS", C.ExtensionSchema, F.EXTENSIONS],
  ["EXTENSION_COMPATIBILITY", C.ExtensionCompatibilitySchema, F.EXTENSION_COMPATIBILITY],
  ["LICENCES", C.LicenceSchema, F.LICENCES],
  ["LICENCE_FILES", C.LicenceFileSchema, F.LICENCE_FILES],
  ["PROVISIONING_JOBS", C.ProvisioningJobSchema, F.PROVISIONING_JOBS],
  ["OFFBOARDING_JOBS", C.OffboardingJobSchema, F.OFFBOARDING_JOBS],
  ["SHRED_CERTIFICATES", C.ShredCertificateSchema, F.SHRED_CERTIFICATES],
  ["PORTABILITY_JOBS", C.PortabilityJobSchema, F.PORTABILITY_JOBS],
  ["SANDBOXES", C.SandboxSchema, F.SANDBOXES],
  ["SUPPORT_TICKETS", C.SupportTicketSchema, F.SUPPORT_TICKETS],
  ["TICKET_REPLIES", C.TicketReplySchema, F.TICKET_REPLIES],
  ["SLA_POLICIES", C.SlaPolicySchema, F.SLA_POLICIES],
  ["KNOWLEDGE_ARTICLES", C.KnowledgeArticleSchema, F.KNOWLEDGE_ARTICLES],
  ["BROKER_REQUESTS", C.BrokerRequestSchema, F.BROKER_REQUESTS],
  ["BROKER_SESSIONS", C.BrokerSessionSchema, F.BROKER_SESSIONS],
  ["BREAK_GLASS_CASES", C.BreakGlassCaseSchema, F.BREAK_GLASS_CASES],
  ["PARTNERS", C.PartnerSchema, F.PARTNERS],
  ["DEAL_REGISTRATIONS", C.DealRegistrationSchema, F.DEAL_REGISTRATIONS],
  ["SUB_PROCESSORS", C.SubProcessorSchema, F.SUB_PROCESSORS],
  ["CERTIFICATIONS", C.CertificationSchema, F.CERTIFICATIONS],
  ["SECURITY_INCIDENTS", C.SecurityIncidentSchema, F.SECURITY_INCIDENTS],
  ["DPA_RECORDS", C.DpaRecordSchema, F.DPA_RECORDS],
  ["IMPLEMENTATION_PROJECTS", C.ImplementationProjectSchema, F.IMPLEMENTATION_PROJECTS],
  ["BUSINESS_METRICS", C.BusinessMetricsSchema, F.BUSINESS_METRICS],
  ["ACCOUNT_HEALTH", C.AccountHealthSchema, F.ACCOUNT_HEALTH],
];

const ids = (rows: readonly { id: string }[]) => new Set(rows.map((r) => r.id));
const ACCOUNT_IDS = ids(F.ACCOUNTS);
const STAFF_IDS = ids(F.STAFF_USERS);
const DEPLOYMENT_IDS = ids(F.DEPLOYMENTS);
const CATALOGUE_IDS = ids(F.CATALOGUE_ITEMS);
const INVOICE_IDS = ids(F.INVOICES);
const PARTNER_IDS = ids(F.PARTNERS);

describe("Nexus Control fixtures", () => {
  it.each(SETS)("%s rows parse with their contract", (_name, schema, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const result = schema.safeParse(row);
      expect(result.success, JSON.stringify(result.error)).toBe(true);
    }
  });

  it("has one staff member per role, all MFA-enrolled, and every role has permissions", () => {
    for (const role of C.StaffRoleSchema.options) {
      expect(
        F.STAFF_USERS.some((s) => (s.roles as readonly string[]).includes(role)),
        role,
      ).toBe(true);
      expect(F.CONTROL_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
    expect(F.STAFF_USERS.every((s) => s.mfaEnrolled)).toBe(true);
    for (const p of F.CONTROL_PERMISSIONS) expect(C.ControlPermissionSchema.parse(p)).toBe(p);
  });

  it("references only ids that exist", () => {
    const accountRows = [
      ...F.ACCOUNT_CONTACTS,
      ...F.OPPORTUNITIES,
      ...F.ACCOUNT_NOTES,
      ...F.CONTRACTS,
      ...F.QUOTES,
      ...F.SUBSCRIPTIONS,
      ...F.INVOICES,
      ...F.DUNNING_STATES,
      ...F.USAGE_RECORDS,
      ...F.EXTENSIONS,
      ...F.LICENCES,
      ...F.OFFBOARDING_JOBS,
      ...F.PORTABILITY_JOBS,
      ...F.SUPPORT_TICKETS,
      ...F.BROKER_REQUESTS,
      ...F.BREAK_GLASS_CASES,
      ...F.DEAL_REGISTRATIONS,
      ...F.DPA_RECORDS,
      ...F.IMPLEMENTATION_PROJECTS,
      ...F.ACCOUNT_HEALTH,
    ];
    for (const row of accountRows) expect(ACCOUNT_IDS.has(row.accountId), row.accountId).toBe(true);
    for (const a of F.ACCOUNTS) {
      expect(STAFF_IDS.has(a.ownerStaffId)).toBe(true);
      if (a.partnerId) expect(PARTNER_IDS.has(a.partnerId)).toBe(true);
    }
    for (const d of F.DEPLOYMENTS) {
      if (d.accountId) expect(ACCOUNT_IDS.has(d.accountId)).toBe(true);
      for (const e of d.extensionIds) expect(ids(F.EXTENSIONS).has(e)).toBe(true);
    }
    for (const s of F.SUBSCRIPTIONS) {
      for (const item of [s.planItemId, ...s.addonItemIds])
        expect(CATALOGUE_IDS.has(item)).toBe(true);
    }
    for (const q of F.QUOTES)
      for (const l of q.lines) expect(CATALOGUE_IDS.has(l.itemId)).toBe(true);
    for (const p of [...F.PAYMENTS, ...F.CREDIT_NOTES, ...F.COMMISSIONS]) {
      expect(INVOICE_IDS.has(p.invoiceId)).toBe(true);
    }
    for (const x of [...F.HEALTH_SIGNALS, ...F.LICENCES.filter((l) => l.deploymentId)]) {
      expect(DEPLOYMENT_IDS.has(x.deploymentId ?? "")).toBe(true);
    }
    for (const r of F.ROLLOUTS) {
      expect(ids(F.RELEASES).has(r.releaseId)).toBe(true);
      for (const d of r.deploymentIds) expect(DEPLOYMENT_IDS.has(d)).toBe(true);
    }
    for (const t of F.SUPPORT_TICKETS) {
      if (t.assigneeStaffId) expect(STAFF_IDS.has(t.assigneeStaffId)).toBe(true);
    }
    for (const r of F.TICKET_REPLIES) expect(ids(F.SUPPORT_TICKETS).has(r.ticketId)).toBe(true);
    for (const j of F.OFFBOARDING_JOBS) {
      expect(ids(F.SHRED_CERTIFICATES).has(j.shredCertificateId ?? "")).toBe(true);
    }
  });

  it("mirrors the institution side of access requests and break-glass (M83)", () => {
    expect(F.BROKER_REQUESTS.map((r) => r.id).sort()).toEqual(
      ACCESS_REQUESTS.map((r) => r.id).sort(),
    );
    for (const r of F.BROKER_REQUESTS) {
      const m83 = ACCESS_REQUESTS.find((a) => a.id === r.id);
      expect(r.tenantId).toBe(m83?.tenantId);
      expect(r.decidedAt).toBe(m83?.decidedAt);
      expect(STAFF_IDS.has(r.requestedByStaffId)).toBe(true);
      const account = F.ACCOUNTS.find((a) => a.id === r.accountId);
      expect(account?.tenantIds).toContain(r.tenantId);
    }
    const notice = BREAK_GLASS_NOTICES[0];
    const bg = F.BREAK_GLASS_CASES.find((c) => c.id === notice?.id);
    expect(bg?.approverStaffIds).toEqual(notice?.approverRefs);
    expect(bg?.openedAt).toBe(notice?.occurredAt);
    expect(bg?.institutionNotifiedAt).toBe(notice?.notifiedAt);
  });

  it("keeps accounts, usage and licences consistent", () => {
    const demoTenants = Object.values(TENANT);
    for (const t of demoTenants) {
      expect(F.ACCOUNTS.filter((a) => (a.tenantIds as readonly string[]).includes(t))).toHaveLength(
        1,
      );
    }
    for (const l of F.LICENCES) {
      const account = F.ACCOUNTS.find((a) => a.id === l.accountId);
      expect(account?.deliveryModel).toBe("self_hosted");
      expect(account?.learnerCount ?? 0).toBeLessThanOrEqual(l.learnerCap);
    }
    const airGapped: string[] = F.DEPLOYMENTS.filter((d) => d.airGapped).map((d) => d.id);
    expect(F.USAGE_RECORDS.some((u) => airGapped.includes(u.deploymentId ?? ""))).toBe(false);
    expect(F.HEALTH_SIGNALS.some((h) => airGapped.includes(h.deploymentId))).toBe(false);
    const months = F.BUSINESS_METRICS.map((m) => m.month);
    expect(months).toHaveLength(12);
    expect([...months].sort()).toEqual(months);
  });

  it("pays commissions only to the partner that manages the account", () => {
    for (const c of F.COMMISSIONS) {
      const invoice = F.INVOICES.find((i) => i.id === c.invoiceId);
      const account = F.ACCOUNTS.find((a) => a.id === invoice?.accountId);
      expect(account?.partnerId).toBe(c.partnerId);
      expect(invoice?.status).toBe("paid");
    }
  });
});
