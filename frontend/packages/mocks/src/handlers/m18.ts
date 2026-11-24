import {
  ConcessionSchema,
  FeeHeadSchema,
  FeeInvoiceSchema,
  FeePaymentInputSchema,
  FeePaymentSchema,
  FeePlanSchema,
  FeeRefundSchema,
  pageSchema,
  type FeeInvoice,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  familyOf,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, param, type RouteContext } from "./route";

const M = { module: "M18" } as const;
const READ = "m18.fees.read";
const MANAGE = "m18.fees.manage";
const staff = { ...M, permission: READ };

const paymentReceipts = new Map<string, string>();

function isStaff(viewer: Viewer): boolean {
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).some(
    (row) => row.kind === "staff" && row.personId === viewer.personId,
  );
}

function hasActiveStaffProfile(viewer: Viewer): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).some(
    (row) =>
      row.kind === "staff" &&
      row.personId === viewer.personId &&
      row.status === "active" &&
      row.effectiveFrom <= today &&
      (row.effectiveTo === null || row.effectiveTo >= today),
  );
}

function nextReceiptNumber(tenantId: string): string {
  const existing = ofTenant(mockDb.feePayments, tenantId);
  let max = existing.length;
  for (const row of existing) {
    const match = /^R-(\d{6})$/.exec(row.receiptNumber);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `R-${String(max + 1).padStart(6, "0")}`;
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
  http.post(`*${API_BASE}/fee-payments`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M18")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(MANAGE)) throw new ApiFailure("forbidden");
      if (!hasActiveStaffProfile(viewer)) throw new ApiFailure("forbidden");

      const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || null;
      const receiptKey = idempotencyKey ? JSON.stringify([tenantId, idempotencyKey]) : null;
      const raw: unknown = await request.json().catch(() => undefined);

      // No await between looking up the receipt and applying the payment.
      const previousId = receiptKey ? paymentReceipts.get(receiptKey) : undefined;
      if (previousId) {
        const previous = mockDb.feePayments.find(
          (row) => row.id === previousId && row.tenantId === tenantId,
        );
        if (previous) return HttpResponse.json(previous as JsonBodyType, { status: 201 });
      }

      const parsed = FeePaymentInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((issue) => ({
            path: String(issue.path[0] ?? ""),
            message: "Invalid fee payment",
          })),
        );
      }
      const input = parsed.data;

      const tenantInvoices = ofTenant(mockDb.feeInvoices, tenantId);
      const invoices: FeeInvoice[] = [];
      for (const invoiceId of input.invoiceIds) {
        const invoice = tenantInvoices.find((row) => row.id === invoiceId);
        if (!invoice || (invoice.status !== "issued" && invoice.status !== "part_paid")) {
          throw new ApiFailure("invalid_request", [
            { path: "invoiceIds", message: "Invoice is not open for payment" },
          ]);
        }
        if (invoice.currency !== input.currency) {
          throw new ApiFailure("invalid_request", [
            { path: "currency", message: "Currency does not match the selected invoices" },
          ]);
        }
        invoices.push(invoice);
      }

      const totalBalance = invoices.reduce((sum, inv) => sum + (inv.total - inv.paid), 0);
      if (input.amount > totalBalance) {
        throw new ApiFailure("invalid_request", [
          { path: "amount", message: "Amount exceeds remaining balance" },
        ]);
      }

      const firstInvoice = invoices[0];
      const learner = firstInvoice
        ? ofTenant(mockDb.learners, tenantId).find((row) => row.id === firstInvoice.learnerId)
        : undefined;
      if (!learner) {
        throw new ApiFailure("invalid_request", [
          { path: "invoiceIds", message: "Invoice learner not found" },
        ]);
      }

      const ordered = [...invoices].sort(
        (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
      );
      const now = new Date().toISOString();
      let remaining = input.amount;
      const updates: { target: FeeInvoice; next: FeeInvoice }[] = [];
      for (const inv of ordered) {
        if (remaining <= 0) break;
        const applied = Math.min(inv.total - inv.paid, remaining);
        if (applied <= 0) continue;
        remaining -= applied;
        const nextPaid = inv.paid + applied;
        const nextStatus: FeeInvoice["status"] = nextPaid === inv.total ? "paid" : "part_paid";
        const updatedAt = Date.parse(now) >= Date.parse(inv.updatedAt) ? now : inv.updatedAt;
        updates.push({
          target: inv,
          next: FeeInvoiceSchema.parse({
            ...inv,
            paid: nextPaid,
            status: nextStatus,
            updatedAt,
          }),
        });
      }

      const payment = FeePaymentSchema.parse({
        id: `pay-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        invoiceIds: input.invoiceIds,
        payerPersonId: learner.personId,
        currency: input.currency,
        amount: input.amount,
        method: input.method,
        gatewayReference: null,
        receiptNumber: nextReceiptNumber(tenantId),
        receivedAt: input.receivedAt,
        status: "succeeded",
        deviceId: input.deviceId,
      });

      for (const { target, next } of updates) {
        Object.assign(target, next);
      }
      mockDb.feePayments.push(payment);
      if (receiptKey) paymentReceipts.set(receiptKey, payment.id);
      return HttpResponse.json(payment as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
