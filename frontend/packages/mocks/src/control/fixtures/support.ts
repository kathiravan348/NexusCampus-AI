import type {
  BreakGlassCase,
  BrokerRequest,
  BrokerSession,
  KnowledgeArticle,
  SlaPolicy,
  SupportTicket,
  TicketReply,
} from "@nexus/contracts";
import { TENANT } from "../../fixtures/ids";
import { ACCESS_GRANT, ACCESS_REQUEST, ACCESS_REQUESTS } from "../../fixtures/vault";
import { ACCOUNT, STAFF, TICKET } from "./ids";

export const SUPPORT_TICKETS = [
  {
    id: TICKET.apexTemplates,
    number: "TCK-2026-0915",
    accountId: ACCOUNT.apex,
    subject: "Notification templates fail to render",
    summary: "Fee reminder templates fall back to the default language for some guardians.",
    priority: "p2",
    status: "open",
    channel: "portal",
    assigneeStaffId: STAFF.morgan,
    slaDueAt: "2026-09-16T07:00:00Z",
    breached: false,
    accessRequestId: ACCESS_REQUEST.apexApproved,
    createdAt: "2026-09-15T07:00:00Z",
    resolvedAt: null,
  },
  {
    id: TICKET.riversideTheme,
    number: "TCK-2026-0914",
    accountId: ACCOUNT.riverside,
    subject: "North campus theme not applied on tablets",
    summary: "Brand colours show the platform default on iPads at the North campus.",
    priority: "p3",
    status: "waiting_customer",
    channel: "email",
    assigneeStaffId: STAFF.morgan,
    slaDueAt: "2026-09-16T16:00:00Z",
    breached: false,
    accessRequestId: ACCESS_REQUEST.riversidePending,
    createdAt: "2026-09-14T16:00:00Z",
    resolvedAt: null,
  },
  {
    id: TICKET.northbridgeSso,
    number: "TCK-2026-0905",
    accountId: ACCOUNT.northbridge,
    subject: "Duplicate user accounts after SSO change",
    summary: "Institution declined access; fixed together on a customer-started screen share.",
    priority: "p2",
    status: "resolved",
    channel: "phone",
    assigneeStaffId: STAFF.okafor,
    slaDueAt: "2026-09-06T13:00:00Z",
    breached: false,
    accessRequestId: ACCESS_REQUEST.northbridgeDenied,
    createdAt: "2026-09-05T12:30:00Z",
    resolvedAt: "2026-09-06T09:00:00Z",
  },
  {
    id: TICKET.littleStepsCalendar,
    number: "TCK-2026-0810",
    accountId: ACCOUNT.littleSteps,
    subject: "Help importing the academic calendar",
    summary: "Calendar imported during an approved session.",
    priority: "p4",
    status: "closed",
    channel: "portal",
    assigneeStaffId: STAFF.lindqvist,
    slaDueAt: "2026-08-13T04:00:00Z",
    breached: false,
    accessRequestId: ACCESS_REQUEST.littleStepsExpired,
    createdAt: "2026-08-10T03:50:00Z",
    resolvedAt: "2026-08-10T09:00:00Z",
  },
  {
    id: TICKET.coastalBackup,
    number: "TCK-2026-0912",
    accountId: ACCOUNT.coastal,
    subject: "Nightly backup slower since 2.2.5",
    summary: "Customer sent a scrubbed diagnostic bundle after review.",
    priority: "p3",
    status: "open",
    channel: "portal",
    assigneeStaffId: STAFF.lindqvist,
    slaDueAt: "2026-09-14T06:00:00Z",
    breached: true,
    accessRequestId: null,
    createdAt: "2026-09-12T06:00:00Z",
    resolvedAt: null,
  },
  {
    id: TICKET.harmonyBilling,
    number: "TCK-2026-0916",
    accountId: ACCOUNT.harmony,
    subject: "What happens when the trial ends?",
    summary: "",
    priority: "p4",
    status: "new",
    channel: "email",
    assigneeStaffId: null,
    slaDueAt: "2026-09-18T03:00:00Z",
    breached: false,
    accessRequestId: null,
    createdAt: "2026-09-15T03:00:00Z",
    resolvedAt: null,
  },
] satisfies readonly SupportTicket[];

export const TICKET_REPLIES = [
  {
    id: "rep-0915-1",
    ticketId: TICKET.apexTemplates,
    authorKind: "customer",
    authorStaffId: null,
    body: "Some guardians get the reminder in English although they chose Tamil.",
    internal: false,
    aiDrafted: false,
    createdAt: "2026-09-15T07:00:00Z",
  },
  {
    id: "rep-0915-2",
    ticketId: TICKET.apexTemplates,
    authorKind: "staff",
    authorStaffId: STAFF.morgan,
    body: "Requested read access to notifications for 48 hours; waiting for your admin to approve.",
    internal: false,
    aiDrafted: true,
    createdAt: "2026-09-15T07:31:00Z",
  },
  {
    id: "rep-0915-3",
    ticketId: TICKET.apexTemplates,
    authorKind: "staff",
    authorStaffId: STAFF.morgan,
    body: "Same root cause as the 2.4.1 fix; Apex Edge node is on 2.4.1, the cell template cache is not.",
    internal: true,
    aiDrafted: false,
    createdAt: "2026-09-15T09:00:00Z",
  },
] satisfies readonly TicketReply[];

const policy = (
  slaTier: SlaPolicy["slaTier"],
  first: [number, number, number, number],
  resolve: [number, number, number, number],
  twentyFourSeven: boolean,
): SlaPolicy => ({
  slaTier,
  firstResponseMinutes: { p1: first[0], p2: first[1], p3: first[2], p4: first[3] },
  resolutionMinutes: { p1: resolve[0], p2: resolve[1], p3: resolve[2], p4: resolve[3] },
  twentyFourSeven,
});

export const SLA_POLICIES = [
  policy("standard", [240, 480, 1440, 2880], [1440, 4320, 7200, 14400], false),
  policy("priority", [60, 240, 480, 1440], [480, 1440, 2880, 7200], false),
  policy("enterprise", [15, 60, 240, 480], [240, 720, 1440, 4320], true),
] satisfies readonly SlaPolicy[];

export const KNOWLEDGE_ARTICLES = [
  {
    id: "kb-access",
    slug: "approve-support-access",
    locale: "en",
    title: "How support access works",
    body: "Our staff can only see your data after your admin approves a request in Data vault & access.",
    published: true,
    updatedAt: "2026-08-01T00:00:00Z",
  },
  {
    id: "kb-access-hi",
    slug: "approve-support-access",
    locale: "hi",
    title: "सहायता पहुँच कैसे काम करती है",
    body: "आपके एडमिन की मंज़ूरी के बाद ही हमारी टीम आपका डेटा देख सकती है।",
    published: true,
    updatedAt: "2026-08-01T00:00:00Z",
  },
  {
    id: "kb-access-ta",
    slug: "approve-support-access",
    locale: "ta",
    title: "உதவி அணுகல் எப்படி செயல்படுகிறது",
    body: "உங்கள் நிர்வாகி அனுமதித்த பிறகே எங்கள் குழு உங்கள் தரவைப் பார்க்க முடியும்.",
    published: true,
    updatedAt: "2026-08-01T00:00:00Z",
  },
] satisfies readonly KnowledgeArticle[];

const ACCOUNT_OF_TENANT: Readonly<Record<string, string>> = {
  [TENANT.littleSteps]: ACCOUNT.littleSteps,
  [TENANT.riverside]: ACCOUNT.riverside,
  [TENANT.northbridge]: ACCOUNT.northbridge,
  [TENANT.apex]: ACCOUNT.apex,
};
const TICKET_OF_REQUEST: Readonly<Record<string, string>> = {
  [ACCESS_REQUEST.apexApproved]: TICKET.apexTemplates,
  [ACCESS_REQUEST.riversidePending]: TICKET.riversideTheme,
  [ACCESS_REQUEST.northbridgeDenied]: TICKET.northbridgeSso,
  [ACCESS_REQUEST.littleStepsExpired]: TICKET.littleStepsCalendar,
};

/**
 * Our side of the institution's access requests (P10): same ids, same scope and dates as M83. The institution
 * decided each one; an approval whose grant ran out is `ended` here.
 */
export const BROKER_REQUESTS = ACCESS_REQUESTS.map((r): BrokerRequest => ({
  id: r.id,
  accountId: ACCOUNT_OF_TENANT[r.tenantId] ?? "",
  tenantId: r.tenantId,
  requestedByStaffId: r.staffRef,
  ticketId: TICKET_OF_REQUEST[r.id] ?? null,
  reason: r.reason,
  modules: [...r.modules],
  mode: r.mode,
  durationHours: r.durationHours,
  status: r.status === "expired" ? "ended" : r.status,
  requestedAt: r.requestedAt,
  decidedAt: r.decidedAt,
}));

export const BROKER_SESSIONS = [
  {
    id: "bss-ax-0915",
    requestId: ACCESS_REQUEST.apexApproved,
    grantId: ACCESS_GRANT.apexActive,
    staffId: STAFF.morgan,
    startsAt: "2026-09-15T08:00:00Z",
    endsAt: "2026-09-17T08:00:00Z",
    recorded: true,
    actionsCount: 14,
    endedEarlyAt: null,
  },
  {
    id: "bss-ls-0810",
    requestId: ACCESS_REQUEST.littleStepsExpired,
    grantId: ACCESS_GRANT.littleStepsEnded,
    staffId: STAFF.lindqvist,
    startsAt: "2026-08-10T04:30:00Z",
    endsAt: "2026-08-11T04:30:00Z",
    recorded: true,
    actionsCount: 31,
    endedEarlyAt: "2026-08-10T09:00:00Z",
  },
] satisfies readonly BrokerSession[];

/** Our side of Northbridge's break-glass notice (`bgn-nb-0902`): same approvers and times (V-5). */
export const BREAK_GLASS_CASES = [
  {
    id: "bgn-nb-0902",
    accountId: ACCOUNT.northbridge,
    tenantId: TENANT.northbridge,
    category: "security_incident",
    justification:
      "Credential-stuffing attack on the sign-in page; needed the sign-in logs to block it.",
    approverStaffIds: [STAFF.okafor, STAFF.lindqvist],
    openedAt: "2026-09-02T03:10:00Z",
    institutionNotifiedAt: "2026-09-02T03:12:00Z",
    closedAt: "2026-09-02T09:00:00Z",
    reportDeliveredAt: null,
  },
] satisfies readonly BreakGlassCase[];
