import * as F from "./fixtures";

function clone<T>(items: readonly T[]): T[] {
  return structuredClone(items) as T[];
}

/** Mutable in-memory Control database (D50); screen tasks' write handlers change these rows. */
function createControlDb() {
  return {
    staff: clone(F.STAFF_USERS),
    accounts: clone(F.ACCOUNTS),
    contacts: clone(F.ACCOUNT_CONTACTS),
    opportunities: clone(F.OPPORTUNITIES),
    notes: clone(F.ACCOUNT_NOTES),
    contracts: clone(F.CONTRACTS),
    catalogue: clone(F.CATALOGUE_ITEMS),
    quotes: clone(F.QUOTES),
    subscriptions: clone(F.SUBSCRIPTIONS),
    invoices: clone(F.INVOICES),
    payments: clone(F.PAYMENTS),
    creditNotes: clone(F.CREDIT_NOTES),
    dunning: clone(F.DUNNING_STATES),
    usage: clone(F.USAGE_RECORDS),
    commissions: clone(F.COMMISSIONS),
    deployments: clone(F.DEPLOYMENTS),
    healthSignals: clone(F.HEALTH_SIGNALS),
    releases: clone(F.RELEASES),
    rollouts: clone(F.ROLLOUTS),
    extensions: clone(F.EXTENSIONS),
    compatibility: clone(F.EXTENSION_COMPATIBILITY),
    licences: clone(F.LICENCES),
    provisioningJobs: clone(F.PROVISIONING_JOBS),
    offboardingJobs: clone(F.OFFBOARDING_JOBS),
    shredCertificates: clone(F.SHRED_CERTIFICATES),
    portabilityJobs: clone(F.PORTABILITY_JOBS),
    sandboxes: clone(F.SANDBOXES),
    tickets: clone(F.SUPPORT_TICKETS),
    replies: clone(F.TICKET_REPLIES),
    slaPolicies: clone(F.SLA_POLICIES),
    articles: clone(F.KNOWLEDGE_ARTICLES),
    brokerRequests: clone(F.BROKER_REQUESTS),
    brokerSessions: clone(F.BROKER_SESSIONS),
    breakGlassCases: clone(F.BREAK_GLASS_CASES),
    partners: clone(F.PARTNERS),
    deals: clone(F.DEAL_REGISTRATIONS),
    subProcessors: clone(F.SUB_PROCESSORS),
    certifications: clone(F.CERTIFICATIONS),
    incidents: clone(F.SECURITY_INCIDENTS),
    dpas: clone(F.DPA_RECORDS),
    projects: clone(F.IMPLEMENTATION_PROJECTS),
    metrics: clone(F.BUSINESS_METRICS),
    accountHealth: clone(F.ACCOUNT_HEALTH),
  };
}

export type ControlDb = ReturnType<typeof createControlDb>;

export const controlDb: ControlDb = createControlDb();

/** Back to the fixtures (tests call this in `afterEach`). */
export function resetControlDb(): void {
  Object.assign(controlDb, createControlDb());
}
