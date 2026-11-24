import { FEE_INVOICE } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useConcessions,
  useFeeHeads,
  useFeeInvoices,
  useFeePayments,
  useFeePlans,
  useFeeRefunds,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

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
});
