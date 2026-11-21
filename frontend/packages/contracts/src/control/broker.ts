import { z } from "zod";
import { IdSchema, ModuleIdSchema, UtcDateTimeSchema } from "../common";
import { AccessModeSchema, BreakGlassCategorySchema, MAX_GRANT_HOURS } from "../vault";
import { hasNoDuplicates, notBefore } from "./shared";

const HOUR_MS = 3_600_000;

export const BrokerRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
  "ended",
]);
export type BrokerRequestStatus = z.infer<typeof BrokerRequestStatusSchema>;

/**
 * Provider side of an access request (P10). The institution approves or denies it in its own app (M83); `id` is the
 * same id as the M83 `AccessRequest`. We never decide our own access (V-3, D22).
 */
export const BrokerRequestSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    tenantId: IdSchema,
    requestedByStaffId: IdSchema,
    ticketId: IdSchema.nullable(),
    reason: z.string().trim().min(1).max(2000),
    modules: z.array(ModuleIdSchema).min(1),
    mode: AccessModeSchema,
    durationHours: z.int().min(1).max(MAX_GRANT_HOURS),
    status: BrokerRequestStatusSchema,
    requestedAt: UtcDateTimeSchema,
    decidedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((r) => hasNoDuplicates(r.modules), {
    message: "modules has duplicates",
    path: ["modules"],
  })
  .refine((r) => (r.status === "pending") === (r.decidedAt === null), {
    message: "decidedAt is set iff the institution has decided",
    path: ["decidedAt"],
  })
  .refine((r) => r.decidedAt === null || notBefore(r.requestedAt, r.decidedAt), {
    message: "decidedAt is before requestedAt",
    path: ["decidedAt"],
  })
  .refine((r) => !r.modules.includes("M83"), {
    message: "the data vault itself is never in scope",
    path: ["modules"],
  });
export type BrokerRequest = z.infer<typeof BrokerRequestSchema>;

/** One approved, time-boxed, recorded support session (V-3). Every action lands in the tenant's audit log. */
export const BrokerSessionSchema = z
  .strictObject({
    id: IdSchema,
    requestId: IdSchema,
    grantId: IdSchema,
    staffId: IdSchema,
    startsAt: UtcDateTimeSchema,
    endsAt: UtcDateTimeSchema,
    recorded: z.literal(true),
    actionsCount: z.int().min(0),
    endedEarlyAt: UtcDateTimeSchema.nullable(),
  })
  .refine((s) => Date.parse(s.endsAt) > Date.parse(s.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  .refine((s) => Date.parse(s.endsAt) - Date.parse(s.startsAt) <= MAX_GRANT_HOURS * HOUR_MS, {
    message: "a session lasts at most 72 hours",
    path: ["endsAt"],
  })
  .refine(
    (s) =>
      s.endedEarlyAt === null ||
      (notBefore(s.startsAt, s.endedEarlyAt) && Date.parse(s.endedEarlyAt) < Date.parse(s.endsAt)),
    { message: "endedEarlyAt must fall inside the session", path: ["endedEarlyAt"] },
  );
export type BrokerSession = z.infer<typeof BrokerSessionSchema>;

/**
 * Break-glass (V-5): only for a legal order or a security incident, approved by two different people on our side;
 * the institution is notified at once and later receives a report.
 */
export const BreakGlassCaseSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    tenantId: IdSchema,
    category: BreakGlassCategorySchema,
    justification: z.string().trim().min(20).max(4000),
    approverStaffIds: z.tuple([IdSchema, IdSchema]),
    openedAt: UtcDateTimeSchema,
    institutionNotifiedAt: UtcDateTimeSchema,
    closedAt: UtcDateTimeSchema.nullable(),
    reportDeliveredAt: UtcDateTimeSchema.nullable(),
  })
  .refine((c) => c.approverStaffIds[0] !== c.approverStaffIds[1], {
    message: "the two approvers must be different people",
    path: ["approverStaffIds"],
  })
  .refine((c) => notBefore(c.openedAt, c.institutionNotifiedAt), {
    message: "the institution is notified when the case opens, not before",
    path: ["institutionNotifiedAt"],
  })
  .refine((c) => c.reportDeliveredAt === null || c.closedAt !== null, {
    message: "the report follows the close of the case",
    path: ["reportDeliveredAt"],
  })
  .refine(
    (c) =>
      (c.closedAt === null || notBefore(c.openedAt, c.closedAt)) &&
      (c.reportDeliveredAt === null ||
        c.closedAt === null ||
        notBefore(c.closedAt, c.reportDeliveredAt)),
    { message: "dates are out of order", path: ["closedAt"] },
  );
export type BreakGlassCase = z.infer<typeof BreakGlassCaseSchema>;
