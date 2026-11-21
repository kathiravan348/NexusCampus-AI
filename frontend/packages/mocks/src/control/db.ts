import type * as C from "@nexus/contracts";
import * as F from "./fixtures";

/** A mutable deep copy typed by its contract (not the fixture literals), so write handlers can add any valid row. */
function clone<T>(items: readonly T[]): T[] {
  return structuredClone(items) as T[];
}

/** Mutable in-memory Control database (D50); screen tasks' write handlers change these rows. */
function createControlDb() {
  return {
    staff: clone<C.StaffUser>(F.STAFF_USERS),
    accounts: clone<C.Account>(F.ACCOUNTS),
    contacts: clone<C.AccountContact>(F.ACCOUNT_CONTACTS),
    opportunities: clone<C.Opportunity>(F.OPPORTUNITIES),
    notes: clone<C.AccountNote>(F.ACCOUNT_NOTES),
    contracts: clone<C.Contract>(F.CONTRACTS),
    catalogue: clone<C.CatalogueItem>(F.CATALOGUE_ITEMS),
    quotes: clone<C.Quote>(F.QUOTES),
    subscriptions: clone<C.Subscription>(F.SUBSCRIPTIONS),
    invoices: clone<C.Invoice>(F.INVOICES),
    payments: clone<C.Payment>(F.PAYMENTS),
    creditNotes: clone<C.CreditNote>(F.CREDIT_NOTES),
    dunning: clone<C.DunningState>(F.DUNNING_STATES),
    usage: clone<C.UsageRecord>(F.USAGE_RECORDS),
    commissions: clone<C.Commission>(F.COMMISSIONS),
    deployments: clone<C.Deployment>(F.DEPLOYMENTS),
    healthSignals: clone<C.HealthSignal>(F.HEALTH_SIGNALS),
    releases: clone<C.Release>(F.RELEASES),
    rollouts: clone<C.Rollout>(F.ROLLOUTS),
    extensions: clone<C.Extension>(F.EXTENSIONS),
    compatibility: clone<C.ExtensionCompatibility>(F.EXTENSION_COMPATIBILITY),
    licences: clone<C.Licence>(F.LICENCES),
    provisioningJobs: clone<C.ProvisioningJob>(F.PROVISIONING_JOBS),
    offboardingJobs: clone<C.OffboardingJob>(F.OFFBOARDING_JOBS),
    shredCertificates: clone<C.ShredCertificate>(F.SHRED_CERTIFICATES),
    portabilityJobs: clone<C.PortabilityJob>(F.PORTABILITY_JOBS),
    sandboxes: clone<C.Sandbox>(F.SANDBOXES),
    tickets: clone<C.SupportTicket>(F.SUPPORT_TICKETS),
    replies: clone<C.TicketReply>(F.TICKET_REPLIES),
    slaPolicies: clone<C.SlaPolicy>(F.SLA_POLICIES),
    articles: clone<C.KnowledgeArticle>(F.KNOWLEDGE_ARTICLES),
    brokerRequests: clone<C.BrokerRequest>(F.BROKER_REQUESTS),
    brokerSessions: clone<C.BrokerSession>(F.BROKER_SESSIONS),
    breakGlassCases: clone<C.BreakGlassCase>(F.BREAK_GLASS_CASES),
    partners: clone<C.Partner>(F.PARTNERS),
    deals: clone<C.DealRegistration>(F.DEAL_REGISTRATIONS),
    subProcessors: clone<C.SubProcessor>(F.SUB_PROCESSORS),
    certifications: clone<C.Certification>(F.CERTIFICATIONS),
    incidents: clone<C.SecurityIncident>(F.SECURITY_INCIDENTS),
    dpas: clone<C.DpaRecord>(F.DPA_RECORDS),
    projects: clone<C.ImplementationProject>(F.IMPLEMENTATION_PROJECTS),
    metrics: clone<C.BusinessMetrics>(F.BUSINESS_METRICS),
    accountHealth: clone<C.AccountHealth>(F.ACCOUNT_HEALTH),
  };
}

export type ControlDb = ReturnType<typeof createControlDb>;

export const controlDb: ControlDb = createControlDb();

/** Back to the fixtures (tests call this in `afterEach`). */
export function resetControlDb(): void {
  Object.assign(controlDb, createControlDb());
}
