import {
  ConcessionSchema,
  FeeHeadSchema,
  FeeInvoiceSchema,
  FeePaymentSchema,
  FeePlanSchema,
  FeeRefundSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { FEE_INVOICE, LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M18 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [
      ["/fee-heads", pageSchema(FeeHeadSchema)],
      ["/fee-plans", pageSchema(FeePlanSchema)],
      ["/concessions", pageSchema(ConcessionSchema)],
      ["/fee-invoices", pageSchema(FeeInvoiceSchema)],
      ["/fee-payments", pageSchema(FeePaymentSchema)],
      ["/fee-refunds", pageSchema(FeeRefundSchema)],
    ] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("filters invoices by learner and status and rejects foreign filter IDs", async () => {
    const response = await get("/fee-invoices?status=paid");
    expect(response.status).toBe(200);
    const [invoice] = pageSchema(FeeInvoiceSchema).parse(await response.json()).items;
    expect(invoice).toMatchObject({ id: FEE_INVOICE.ls[0], status: "paid", currency: "INR" });
    const filtered = await get(`/fee-invoices?learnerId=${invoice!.learnerId}&status=paid`);
    expect(pageSchema(FeeInvoiceSchema).parse(await filtered.json()).items).toEqual([invoice]);

    expect((await get(`/fee-invoices?learnerId=${LEARNER.rvOliver}`)).status).toBe(404);
    expect((await get(`/fee-payments?invoiceId=${FEE_INVOICE.rv[0]}`)).status).toBe(404);
  });

  it("returns only family invoices and payments to a guardian", async () => {
    const invoices = await get("/fee-invoices", USER.lsSunita);
    expect(invoices.status).toBe(200);
    const { items } = pageSchema(FeeInvoiceSchema).parse(await invoices.json());
    expect(items.length).toBeGreaterThan(0);
    const family = new Set<string>([LEARNER.lsRohan, LEARNER.lsIshaan]);
    expect(items.every((row) => family.has(row.learnerId))).toBe(true);

    const visible = new Set(items.map((row) => row.id));
    const payments = await get("/fee-payments", USER.lsSunita);
    expect(payments.status).toBe(200);
    const familyPayments = pageSchema(FeePaymentSchema).parse(await payments.json()).items;
    expect(familyPayments.length).toBeGreaterThan(0);
    expect(familyPayments.every((row) => row.invoiceIds.every((id) => visible.has(id)))).toBe(true);

    const unrelated = mockDb.feeInvoices.find(
      (row) => row.tenantId === TENANT.littleSteps && !visible.has(row.id),
    )!;
    const ownPayment = mockDb.feePayments.find((row) => row.id === familyPayments[0]?.id)!;
    ownPayment.invoiceIds.push(unrelated.id);
    const ownInvoice = familyPayments[0]?.invoiceIds[0];
    const filtered = await get(`/fee-payments?invoiceId=${ownInvoice}`, USER.lsSunita);
    expect(pageSchema(FeePaymentSchema).parse(await filtered.json()).items).toEqual([]);
    expect((await get(`/fee-payments?invoiceId=${unrelated.id}`, USER.lsSunita)).status).toBe(404);
    expect((await get("/fee-refunds", USER.lsSunita)).status).toBe(403);
  });

  it("denies fee reads to a teacher", async () => {
    for (const path of ["/fee-invoices", "/fee-payments", "/fee-refunds"]) {
      expect((await get(path, USER.lsArjun)).status).toBe(403);
    }
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/fee-heads")).status).toBe(403);
  });
});
