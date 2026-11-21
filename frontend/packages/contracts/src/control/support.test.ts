import { describe, expect, it } from "vitest";
import { BreakGlassCaseSchema, BrokerRequestSchema, BrokerSessionSchema } from "./broker";
import {
  KnowledgeArticleSchema,
  SlaPolicySchema,
  SupportTicketSchema,
  TicketReplySchema,
} from "./support";
import { rejects } from "./test-utils";

const ticket = {
  id: "tck_42",
  number: "TCK-2026-0042",
  accountId: "acc_apex",
  subject: "Fee reminders not sending in Tamil",
  summary: "Reminder template falls back to English since Monday.",
  priority: "p2",
  status: "open",
  channel: "portal",
  assigneeStaffId: "stf_meera",
  slaDueAt: "2026-11-21T12:00:00Z",
  breached: false,
  accessRequestId: null,
  createdAt: "2026-11-21T04:00:00Z",
  resolvedAt: null,
};

describe("SupportTicket and TicketReply", () => {
  it("accepts open, new and resolved tickets", () => {
    expect(SupportTicketSchema.safeParse(ticket).success).toBe(true);
    expect(
      SupportTicketSchema.safeParse({ ...ticket, status: "new", assigneeStaffId: null }).success,
    ).toBe(true);
    expect(
      SupportTicketSchema.safeParse({
        ...ticket,
        status: "resolved",
        resolvedAt: "2026-11-21T08:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects resolvedAt on an open ticket, an SLA before creation and no assignee", () => {
    rejects(SupportTicketSchema, [
      { ...ticket, resolvedAt: "2026-11-21T08:00:00Z" },
      { ...ticket, status: "closed" },
      { ...ticket, slaDueAt: ticket.createdAt },
      { ...ticket, assigneeStaffId: null },
      { ...ticket, priority: "urgent" },
    ]);
  });

  const reply = {
    id: "rep_1",
    ticketId: "tck_42",
    authorKind: "staff",
    authorStaffId: "stf_meera",
    body: "We found the cause and are deploying a fix.",
    internal: false,
    aiDrafted: true,
    createdAt: "2026-11-21T05:00:00Z",
  };

  it("accepts staff and customer replies, rejects mismatched authors", () => {
    expect(TicketReplySchema.safeParse(reply).success).toBe(true);
    expect(
      TicketReplySchema.safeParse({
        ...reply,
        authorKind: "customer",
        authorStaffId: null,
        aiDrafted: false,
      }).success,
    ).toBe(true);
    rejects(TicketReplySchema, [
      { ...reply, authorStaffId: null },
      { ...reply, authorKind: "customer", authorStaffId: null },
    ]);
  });
});

describe("SlaPolicy and KnowledgeArticle", () => {
  const sla = {
    slaTier: "priority",
    firstResponseMinutes: { p1: 30, p2: 120, p3: 480, p4: 1440 },
    resolutionMinutes: { p1: 240, p2: 1440, p3: 4320, p4: 10080 },
    twentyFourSeven: true,
  };

  it("accepts a policy and rejects inverted priorities", () => {
    expect(SlaPolicySchema.safeParse(sla).success).toBe(true);
    rejects(SlaPolicySchema, [
      { ...sla, firstResponseMinutes: { ...sla.firstResponseMinutes, p1: 200 } },
      { ...sla, resolutionMinutes: { ...sla.resolutionMinutes, p1: 10 } },
    ]);
  });

  it("accepts an article in Tamil", () => {
    expect(
      KnowledgeArticleSchema.safeParse({
        id: "kb_1",
        slug: "fee-reminders",
        locale: "ta-IN",
        title: "கட்டண நினைவூட்டல்கள்",
        body: "...",
        published: true,
        updatedAt: "2026-11-01T00:00:00Z",
      }).success,
    ).toBe(true);
  });
});

describe("BrokerRequest, BrokerSession, BreakGlassCase", () => {
  const request = {
    id: "acr_apex_1",
    accountId: "acc_apex",
    tenantId: "ten_apex",
    requestedByStaffId: "stf_meera",
    ticketId: "tck_42",
    reason: "Check the fee reminder template settings.",
    modules: ["M07"],
    mode: "read",
    durationHours: 4,
    status: "approved",
    requestedAt: "2026-11-21T05:00:00Z",
    decidedAt: "2026-11-21T05:20:00Z",
  };

  it("accepts a decided and a pending request", () => {
    expect(BrokerRequestSchema.safeParse(request).success).toBe(true);
    expect(
      BrokerRequestSchema.safeParse({ ...request, status: "pending", decidedAt: null }).success,
    ).toBe(true);
  });

  it("rejects 73 hours, the vault in scope and an undecided approval", () => {
    rejects(BrokerRequestSchema, [
      { ...request, durationHours: 73 },
      { ...request, modules: ["M83"] },
      { ...request, decidedAt: null },
      { ...request, modules: [] },
    ]);
  });

  const session = {
    id: "bss_1",
    requestId: "acr_apex_1",
    grantId: "grt_apex_1",
    staffId: "stf_meera",
    startsAt: "2026-11-21T05:20:00Z",
    endsAt: "2026-11-21T09:20:00Z",
    recorded: true,
    actionsCount: 12,
    endedEarlyAt: null,
  };

  it("accepts a recorded session, rejects unrecorded or over-long ones", () => {
    expect(BrokerSessionSchema.safeParse(session).success).toBe(true);
    rejects(BrokerSessionSchema, [
      { ...session, recorded: false },
      { ...session, endsAt: "2026-11-24T05:21:00Z" },
      { ...session, endedEarlyAt: "2026-11-21T10:00:00Z" },
    ]);
  });

  const bg = {
    id: "bgc_1",
    accountId: "acc_riverside",
    tenantId: "ten_riverside",
    category: "security_incident",
    justification: "Active credential-stuffing attack on the sign-in page; need log access.",
    approverStaffIds: ["stf_lena", "stf_omar"],
    openedAt: "2026-09-02T10:00:00Z",
    institutionNotifiedAt: "2026-09-02T10:00:00Z",
    closedAt: "2026-09-02T14:00:00Z",
    reportDeliveredAt: "2026-09-04T09:00:00Z",
  };

  it("accepts two approvers and rejects one person twice or a report before close", () => {
    expect(BreakGlassCaseSchema.safeParse(bg).success).toBe(true);
    rejects(BreakGlassCaseSchema, [
      { ...bg, approverStaffIds: ["stf_lena", "stf_lena"] },
      { ...bg, approverStaffIds: ["stf_lena"] },
      { ...bg, institutionNotifiedAt: "2026-09-02T09:00:00Z" },
      { ...bg, closedAt: null },
      { ...bg, justification: "need access" },
    ]);
  });
});
