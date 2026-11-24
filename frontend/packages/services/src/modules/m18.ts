import {
  FeeHeadSchema,
  FeePlanSchema,
  ConcessionSchema,
  FeeInvoiceSchema,
  FeePaymentSchema,
  FeeRefundSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type FeeInvoiceStatus,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const FeeHeadPage = pageSchema(FeeHeadSchema);
const FeePlanPage = pageSchema(FeePlanSchema);
const ConcessionPage = pageSchema(ConcessionSchema);
const FeeInvoicePage = pageSchema(FeeInvoiceSchema);
const FeePaymentPage = pageSchema(FeePaymentSchema);
const FeeRefundPage = pageSchema(FeeRefundSchema);

export function useFeeHeads() {
  return useScopedQuery(queryKeys.m18.feeHeads, (c, signal) =>
    c.get("/fee-heads", FeeHeadPage, all, { signal }),
  );
}

export function useFeePlans() {
  return useScopedQuery(queryKeys.m18.feePlans, (c, signal) =>
    c.get("/fee-plans", FeePlanPage, all, { signal }),
  );
}

export function useConcessions() {
  return useScopedQuery(queryKeys.m18.concessions, (c, signal) =>
    c.get("/concessions", ConcessionPage, all, { signal }),
  );
}

export function useFeeInvoices(
  learnerId: string | null = null,
  status: FeeInvoiceStatus | null = null,
) {
  return useScopedQuery(
    (s) => queryKeys.m18.feeInvoices(s, learnerId, status),
    (c, signal) =>
      c.get("/fee-invoices", FeeInvoicePage, { ...all, learnerId, status }, { signal }),
  );
}

export function useFeePayments(invoiceId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m18.feePayments(s, invoiceId),
    (c, signal) => c.get("/fee-payments", FeePaymentPage, { ...all, invoiceId }, { signal }),
  );
}

export function useFeeRefunds() {
  return useScopedQuery(queryKeys.m18.feeRefunds, (c, signal) =>
    c.get("/fee-refunds", FeeRefundPage, all, { signal }),
  );
}
