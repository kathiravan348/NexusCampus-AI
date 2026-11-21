import { z } from "zod";
import { IdSchema, LocaleSchema, UtcDateTimeSchema } from "../common";
import { SlaTierSchema } from "./account";
import { DocumentNumberSchema } from "./shared";

export const TicketPrioritySchema = z.enum(["p1", "p2", "p3", "p4"]);
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;

export const TicketStatusSchema = z.enum(["new", "open", "waiting_customer", "resolved", "closed"]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

const isDone = (s: TicketStatus) => s === "resolved" || s === "closed";

/**
 * A support ticket (P09). Tickets describe the problem, never institution records: customers are asked not to
 * paste learner data, and diagnostics come as scrubbed bundles (V-6).
 */
export const SupportTicketSchema = z
  .strictObject({
    id: IdSchema,
    number: DocumentNumberSchema,
    accountId: IdSchema,
    subject: z.string().trim().min(1).max(200),
    summary: z.string().max(500),
    priority: TicketPrioritySchema,
    status: TicketStatusSchema,
    channel: z.enum(["portal", "email", "phone"]),
    assigneeStaffId: IdSchema.nullable(),
    slaDueAt: UtcDateTimeSchema,
    breached: z.boolean(),
    /** M83 access request raised for this ticket, if any (P10). */
    accessRequestId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    resolvedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((t) => isDone(t.status) === (t.resolvedAt !== null), {
    message: "resolvedAt is set iff resolved or closed",
    path: ["resolvedAt"],
  })
  .refine((t) => Date.parse(t.slaDueAt) > Date.parse(t.createdAt), {
    message: "slaDueAt must be after createdAt",
    path: ["slaDueAt"],
  })
  .refine((t) => t.status === "new" || t.assigneeStaffId !== null, {
    message: "a ticket past new has an assignee",
    path: ["assigneeStaffId"],
  });
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

/** A reply; AI drafts are marked and sent only after a person edits or approves them (P09). */
export const TicketReplySchema = z
  .strictObject({
    id: IdSchema,
    ticketId: IdSchema,
    authorKind: z.enum(["staff", "customer"]),
    authorStaffId: IdSchema.nullable(),
    body: z.string().trim().min(1).max(5000),
    internal: z.boolean(),
    aiDrafted: z.boolean(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((r) => (r.authorKind === "staff") === (r.authorStaffId !== null), {
    message: "authorStaffId is set iff a staff member wrote it",
    path: ["authorStaffId"],
  })
  .refine((r) => r.authorKind === "staff" || (!r.internal && !r.aiDrafted), {
    message: "customer replies are never internal or AI-drafted",
    path: ["internal"],
  });
export type TicketReply = z.infer<typeof TicketReplySchema>;

const Minutes = z.int().min(1);
const PerPriority = z.strictObject({ p1: Minutes, p2: Minutes, p3: Minutes, p4: Minutes });

/** Response and resolution targets per SLA tier, in minutes. P1 must be the fastest. */
export const SlaPolicySchema = z
  .strictObject({
    slaTier: SlaTierSchema,
    firstResponseMinutes: PerPriority,
    resolutionMinutes: PerPriority,
    twentyFourSeven: z.boolean(),
  })
  .refine(
    (p) =>
      [p.firstResponseMinutes, p.resolutionMinutes].every(
        (m) => m.p1 <= m.p2 && m.p2 <= m.p3 && m.p3 <= m.p4,
      ),
    { message: "higher priorities must be at least as fast", path: ["firstResponseMinutes"] },
  )
  .refine(
    (p) =>
      (["p1", "p2", "p3", "p4"] as const).every(
        (k) => p.firstResponseMinutes[k] <= p.resolutionMinutes[k],
      ),
    { message: "first response cannot be later than resolution", path: ["resolutionMinutes"] },
  );
export type SlaPolicy = z.infer<typeof SlaPolicySchema>;

/** A help article, per locale; also the source for AI answer drafts (P09). */
export const KnowledgeArticleSchema = z.strictObject({
  id: IdSchema,
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  locale: LocaleSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  published: z.boolean(),
  updatedAt: UtcDateTimeSchema,
});
export type KnowledgeArticle = z.infer<typeof KnowledgeArticleSchema>;
