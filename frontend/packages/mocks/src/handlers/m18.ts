import {
  ConcessionSchema,
  FeeHeadSchema,
  FeeInvoiceSchema,
  FeePaymentSchema,
  FeePlanSchema,
  FeeRefundSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, param, type RouteContext } from "./route";

const M = { module: "M18" } as const;
const READ = "m18.fees.read";
const staff = { ...M, permission: READ };

function isStaff(viewer: Viewer): boolean {
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).some(
    (row) => row.kind === "staff" && row.personId === viewer.personId,
  );
}

/** Family access applies to learner and guardian viewers, including learner self-access. */
export function familyLearnerIds(viewer: Viewer): ReadonlySet<string> {
  if (isStaff(viewer)) throw new ApiFailure("forbidden");
  const people = familyOf(viewer);
  const ids = new Set(
    ofTenant(mockDb.learners, viewer.tenantId)
      .filter((row) => people.has(row.personId))
      .map((row) => row.id),
  );
  if (ids.size === 0) throw new ApiFailure("forbidden");
  return ids;
}

export function readLearnerFilter(ctx: RouteContext, family: ReadonlySet<string> | null) {
  const learnerId = param(ctx.url, "learnerId");
  if (learnerId !== null) {
    found(
      ofTenant(mockDb.learners, ctx.viewer.tenantId).find(
        (row) => row.id === learnerId && (family === null || family.has(row.id)),
      ),
    );
  }
  return learnerId;
}

export const m18Handlers = [
  get("/fee-heads", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.feeHeads, ctx.viewer.tenantId), pageSchema(FeeHeadSchema)),
  ),
  get("/fee-plans", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.feePlans, ctx.viewer.tenantId), pageSchema(FeePlanSchema)),
  ),
  get("/concessions", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.concessions, ctx.viewer.tenantId), pageSchema(ConcessionSchema)),
  ),
  get("/fee-invoices", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const status = param(ctx.url, "status");
    const invoices = ofTenant(mockDb.feeInvoices, viewer.tenantId).filter(
      (row) =>
        (family === null || family.has(row.learnerId)) &&
        (learnerId === null || row.learnerId === learnerId) &&
        (status === null || row.status === status),
    );
    return list(ctx, invoices, pageSchema(FeeInvoiceSchema));
  }),
  get("/fee-payments", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const invoiceId = param(ctx.url, "invoiceId");
    const invoiceIds = new Set(
      ofTenant(mockDb.feeInvoices, viewer.tenantId)
        .filter((row) => family === null || family.has(row.learnerId))
        .map((row) => row.id),
    );
    if (invoiceId !== null) found(invoiceIds.has(invoiceId) ? invoiceId : undefined);
    const payments = ofTenant(mockDb.feePayments, viewer.tenantId).filter(
      (row) =>
        // A combined payment exposes its total and every invoice ID.
        row.invoiceIds.every((id) => invoiceIds.has(id)) &&
        (invoiceId === null || row.invoiceIds.includes(invoiceId)),
    );
    return list(ctx, payments, pageSchema(FeePaymentSchema));
  }),
  get("/fee-refunds", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.feeRefunds, ctx.viewer.tenantId), pageSchema(FeeRefundSchema)),
  ),
];
