import { FEE_INVOICE, mockDb, resetMockDb } from "@nexus/mocks";
import { getOrCreateDeviceId } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useConcessions,
  useFeeHeads,
  useFeeInvoices,
  useFeePayments,
  useFeePlans,
  useFeeRefunds,
  useRecordFeePayment,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(resetMockDb);

describe("M18 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => {
        const invoices = useFeeInvoices(null, "paid");
        const invoice = invoices.data?.items[0];
        return {
          heads: useFeeHeads(),
          plans: useFeePlans(),
          concessions: useConcessions(),
          invoices,
          learnerInvoices: useFeeInvoices(invoice?.learnerId ?? null, "paid"),
          payments: useFeePayments(FEE_INVOICE.ls[0]),
          refunds: useFeeRefunds(),
          invoice,
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.heads.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.plans.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.concessions.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.invoices.data?.items).toMatchObject([
        { id: FEE_INVOICE.ls[0], status: "paid" },
      ]);
      expect(result.current.invoice).toBeDefined();
      expect(result.current.learnerInvoices.data?.items).toEqual([result.current.invoice]);
      expect(result.current.payments.data?.items).toMatchObject([
        { invoiceIds: [FEE_INVOICE.ls[0]] },
      ]);
      expect(result.current.refunds.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
    });
  });

  it("records a payment online with null deviceId and invalidates M18 queries", async () => {
    signInAs(ADMIN);
    const openInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const balance = openInvoice.total - openInvoice.paid;
    const { result } = renderHook(
      () => ({
        invoices: useFeeInvoices(),
        payments: useFeePayments(),
        record: useRecordFeePayment(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.invoices.isSuccess).toBe(true);
      expect(result.current.payments.isSuccess).toBe(true);
    });
    const initialPayments = result.current.payments.data?.items.length ?? 0;

    let outcome: Awaited<ReturnType<typeof result.current.record.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.record.mutateAsync({
        invoiceIds: [openInvoice.id],
        currency: openInvoice.currency,
        amount: balance,
        method: "cash",
        receivedAt: "2026-11-24T10:00:00Z",
        deviceId: null,
      });
    });

    expect(outcome?.queued).toBe(false);
    if (outcome && !outcome.queued) {
      expect(outcome.data.deviceId).toBeNull();
      expect(outcome.data.receiptNumber).toMatch(/^R-\d{6}$/);
    }
    await waitFor(() => {
      expect(result.current.payments.data?.items.length).toBe(initialPayments + 1);
      const updated = result.current.invoices.data?.items.find((row) => row.id === openInvoice.id);
      expect(updated?.status).toBe("paid");
    });
  });

  it("queues offline and replays once with the outbox deviceId on reconnect", async () => {
    signInAs(ADMIN);
    const db = freshDb();
    const openInvoice = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.ls[1])!;
    const balance = openInvoice.total - openInvoice.paid;
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    try {
      const { result } = renderHook(
        () => ({
          invoices: useFeeInvoices(),
          payments: useFeePayments(),
          record: useRecordFeePayment(),
        }),
        { wrapper: wrapper({ db }) },
      );

      await waitFor(() => {
        expect(result.current.invoices.isSuccess).toBe(true);
        expect(result.current.payments.isSuccess).toBe(true);
      });
      const beforeCount = mockDb.feePayments.length;
      const beforeVisiblePayments = result.current.payments.data?.items.length ?? 0;

      online.mockReturnValue(false);
      await act(async () => {
        const res = await result.current.record.mutateAsync({
          invoiceIds: [openInvoice.id],
          currency: openInvoice.currency,
          amount: balance,
          method: "cash",
          receivedAt: "2026-11-24T10:30:00Z",
          deviceId: null,
        });
        expect(res.queued).toBe(true);
      });

      await waitFor(() => expect(result.current.record.pendingPayments).toHaveLength(1));
      expect(mockDb.feePayments).toHaveLength(beforeCount);

      const expectedDeviceId = await getOrCreateDeviceId(db);
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(mockDb.feePayments).toHaveLength(beforeCount + 1));
      expect(mockDb.feePayments.at(-1)?.deviceId).toBe(expectedDeviceId);
      await waitFor(() => expect(result.current.record.pendingPayments).toHaveLength(0));
      await waitFor(() => {
        expect(result.current.payments.data?.items.length).toBe(beforeVisiblePayments + 1);
        const updated = result.current.invoices.data?.items.find(
          (row) => row.id === openInvoice.id,
        );
        expect(updated?.status).toBe("paid");
      });
    } finally {
      online.mockRestore();
    }
  });
});
