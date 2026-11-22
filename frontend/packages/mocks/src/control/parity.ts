import * as C from "@nexus/contracts";
import { type ParityContractEntry, buildParitySamples } from "../fixtures/parity";
import {
  ACCOUNT_CONTACTS,
  ACCOUNT_NOTES,
  ACCOUNTS,
  CATALOGUE_ITEMS,
  CONTRACTS,
  CONTROL_ROLE_PERMISSIONS,
  CREDIT_NOTES,
  DEPLOYMENTS,
  DUNNING_STATES,
  HEALTH_SIGNALS,
  INVOICES,
  KNOWLEDGE_ARTICLES,
  LICENCE_FILES,
  LICENCES,
  OPPORTUNITIES,
  PARTNERS,
  PAYMENTS,
  QUOTES,
  RELEASES,
  ROLLOUTS,
  SLA_POLICIES,
  STAFF_USERS,
  SUBSCRIPTIONS,
  SUPPORT_TICKETS,
  TICKET_REPLIES,
  USAGE_RECORDS,
} from "./fixtures";

const STAFF_DIRECTORY_ENTRIES = STAFF_USERS.map(({ id, displayName }) => ({ id, displayName }));

const STAFF_SESSIONS = STAFF_USERS.slice(0, 3).map((staff) => ({
  staff,
  permissions: [...new Set(staff.roles.flatMap((role) => CONTROL_ROLE_PERMISSIONS[role]))],
  mfaVerified: true as const,
  expiresAt: "2026-09-15T13:00:00Z",
}));

/**
 * Control contracts served by the real control backend (`backend/src/nexus/control/main.py`, NEX-116), with demo rows
 * as valid samples. The backend test maps each name to its Pydantic model; the remaining Control contracts stay mock
 * only until built (`docs/CONTRACTS.md`).
 */
const CONTROL_CONTRACTS: readonly ParityContractEntry[] = [
  ["Partner", C.PartnerSchema, PARTNERS],
  ["Account", C.AccountSchema, ACCOUNTS],
  ["AccountContact", C.AccountContactSchema, ACCOUNT_CONTACTS],
  ["Opportunity", C.OpportunitySchema, OPPORTUNITIES],
  ["Contract", C.ContractSchema, CONTRACTS],
  ["AccountNote", C.AccountNoteSchema, ACCOUNT_NOTES],
  ["StaffDirectoryEntry", C.StaffDirectoryEntrySchema, STAFF_DIRECTORY_ENTRIES],
  ["StaffSession", C.StaffSessionSchema, STAFF_SESSIONS],
  ["CatalogueItem", C.CatalogueItemSchema, CATALOGUE_ITEMS],
  ["Quote", C.QuoteSchema, QUOTES],
  ["Subscription", C.SubscriptionSchema, SUBSCRIPTIONS],
  ["Invoice", C.InvoiceSchema, INVOICES],
  ["Payment", C.PaymentSchema, PAYMENTS],
  ["CreditNote", C.CreditNoteSchema, CREDIT_NOTES],
  ["DunningState", C.DunningStateSchema, DUNNING_STATES],
  ["UsageRecord", C.UsageRecordSchema, USAGE_RECORDS],
  ["Licence", C.LicenceSchema, LICENCES],
  ["LicenceFile", C.LicenceFileSchema, LICENCE_FILES],
  ["Deployment", C.DeploymentSchema, DEPLOYMENTS],
  ["HealthSignal", C.HealthSignalSchema, HEALTH_SIGNALS],
  ["Release", C.ReleaseSchema, RELEASES],
  ["Rollout", C.RolloutSchema, ROLLOUTS],
  ["SupportTicket", C.SupportTicketSchema, SUPPORT_TICKETS],
  ["TicketReply", C.TicketReplySchema, TICKET_REPLIES],
  ["SlaPolicy", C.SlaPolicySchema, SLA_POLICIES],
  ["KnowledgeArticle", C.KnowledgeArticleSchema, KNOWLEDGE_ARTICLES],
];

/** Written to `backend/tests/parity/control_samples.json` (NEX-116). */
export function controlParitySamples() {
  return buildParitySamples(CONTROL_CONTRACTS);
}

export function controlParitySamplesJson(): string {
  return `${JSON.stringify({ contracts: controlParitySamples() }, null, 2)}\n`;
}
