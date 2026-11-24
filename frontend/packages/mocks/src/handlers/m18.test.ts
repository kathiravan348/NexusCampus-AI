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

function postPayment(body: unknown, key?: string, user: string = USER.lsPriya) {
  return fetch("http://localhost/api/v1/fee-payments", {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("M18 write handler (POST /fee-payments)", () => {
  it("records a manual receipt, applies oldest due first and updates invoice status", async () => {
    const partInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const issuedInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[2])!;
    const partBalance = partInvoice.total - partInvoice.paid;
    const partialNext = 50_000;
    const learner = mockDb.learners.find((row) => row.id === issuedInvoice.learnerId)!;

    // Pass newer invoice first to verify oldest due date is still settled first.
    const response = await postPayment(
      {
        invoiceIds: [issuedInvoice.id, partInvoice.id],
        currency: partInvoice.currency,
        amount: partBalance + partialNext,
        method: "cash",
        receivedAt: "2026-11-24T10:00:00Z",
        deviceId: "device-desk-1",
      },
      crypto.randomUUID(),
    );

    expect(response.status).toBe(201);
    const payment = FeePaymentSchema.parse(await response.json());
    expect(payment).toMatchObject({
      tenantId: TENANT.littleSteps,
      invoiceIds: [issuedInvoice.id, partInvoice.id],
      payerPersonId: learner.personId,
      currency: partInvoice.currency,
      amount: partBalance + partialNext,
      method: "cash",
      gatewayReference: null,
      status: "succeeded",
      deviceId: "device-desk-1",
    });
    expect(payment.receiptNumber).toMatch(/^R-\d{6}$/);

    expect(FeeInvoiceSchema.parse(partInvoice)).toMatchObject({
      paid: partInvoice.total,
      status: "paid",
    });
    expect(FeeInvoiceSchema.parse(issuedInvoice)).toMatchObject({
      paid: partialNext,
      status: "part_paid",
    });
  });

  it("returns the first payment without double-applying when Idempotency-Key repeats", async () => {
    const openInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const balance = openInvoice.total - openInvoice.paid;
    const initialCount = mockDb.feePayments.length;
    const key = crypto.randomUUID();
    const body = {
      invoiceIds: [openInvoice.id],
      currency: openInvoice.currency,
      amount: balance,
      method: "bank_transfer",
      receivedAt: "2026-11-24T10:05:00Z",
      deviceId: null,
    };

    const [first, second] = await Promise.all([postPayment(body, key), postPayment(body, key)]);
    expect([first.status, second.status]).toEqual([201, 201]);
    const payment = FeePaymentSchema.parse(await first.json());
    expect(await second.json()).toEqual(payment);
    expect(mockDb.feePayments).toHaveLength(initialCount + 1);
    expect(openInvoice.status).toBe("paid");

    // A later replay after the invoice is paid still returns the original payment.
    const replay = await postPayment(body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(payment);
    expect(mockDb.feePayments).toHaveLength(initialCount + 1);
  });

  it("rejects over-balance, closed, foreign, wrong-currency and online payments", async () => {
    const openInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const paidInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[0])!;
    const balance = openInvoice.total - openInvoice.paid;
    const base = {
      invoiceIds: [openInvoice.id],
      currency: openInvoice.currency,
      amount: balance,
      method: "cheque",
      receivedAt: "2026-11-24T10:10:00Z",
      deviceId: null,
    };

    const over = await postPayment({ ...base, amount: balance + 1 });
    expect(over.status).toBe(400);
    expect(await over.text()).toContain('"path":"amount"');

    const closed = await postPayment({ ...base, invoiceIds: [paidInvoice.id] });
    expect(closed.status).toBe(400);
    expect(await closed.text()).toContain('"path":"invoiceIds"');

    const foreign = await postPayment({ ...base, invoiceIds: [FEE_INVOICE.rv[1]] });
    expect(foreign.status).toBe(400);
    const foreignText = await foreign.text();
    expect(foreignText).toContain('"path":"invoiceIds"');
    expect(foreignText).not.toContain(FEE_INVOICE.rv[1]);

    const badCurrency = await postPayment({ ...base, currency: "GBP" });
    expect(badCurrency.status).toBe(400);
    expect(await badCurrency.text()).toContain('"path":"currency"');

    const onlineMethod = await postPayment({ ...base, method: "upi" });
    expect(onlineMethod.status).toBe(400);
    expect(await onlineMethod.text()).toContain('"path":"method"');

    const dupIds = await postPayment({ ...base, invoiceIds: [openInvoice.id, openInvoice.id] });
    expect(dupIds.status).toBe(400);
    expect(await dupIds.text()).toContain('"path":"invoiceIds"');
  });

  it("denies payment writes without permission, entitlement or active staff", async () => {
    const openInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const body = {
      invoiceIds: [openInvoice.id],
      currency: openInvoice.currency,
      amount: 1000,
      method: "cash",
      receivedAt: "2026-11-24T10:15:00Z",
      deviceId: null,
    };

    expect((await postPayment(body, undefined, USER.lsSunita)).status).toBe(403);
    expect((await postPayment(body, undefined, USER.lsArjun)).status).toBe(403);

    const profiles = mockDb.roleProfiles.filter(
      (row) => row.tenantId === TENANT.littleSteps && row.kind === "staff",
    );
    for (const profile of profiles) profile.effectiveTo = "2000-01-01";
    expect((await postPayment(body)).status).toBe(403);
    for (const profile of profiles) profile.effectiveTo = null;

    const entitlement = mockDb.entitlements.find(
      (row) => row.tenantId === TENANT.littleSteps && row.moduleId === "M18",
    )!;
    entitlement.enabled = false;
    expect((await postPayment(body)).status).toBe(403);
  });
});
