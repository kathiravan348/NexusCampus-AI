import {
  DunningStateSchema,
  InvoiceSchema,
  PAGE_SIZE_MAX,
  PaymentSchema,
  SubscriptionSchema,
  pageSchema,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const SubscriptionPageSchema = pageSchema(SubscriptionSchema);
export const InvoicePageSchema = pageSchema(InvoiceSchema);
export const PaymentPageSchema = pageSchema(PaymentSchema);
export const DunningPageSchema = pageSchema(DunningStateSchema);
export const RecordTransferResultSchema = z.strictObject({
  invoice: InvoiceSchema,
  payment: PaymentSchema,
});

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useSubscriptions() {
  return useControlQuery("/subscriptions", SubscriptionPageSchema, ALL);
}

export function useInvoices() {
  return useControlQuery("/invoices", InvoicePageSchema, ALL);
}

export function usePayments() {
  return useControlQuery("/payments", PaymentPageSchema, ALL);
}

export function useDunning() {
  return useControlQuery("/dunning", DunningPageSchema, ALL);
}

/** Records a received bank transfer that pays an invoice (`ctl.billing.manage`); billing lists refetch. */
export function useRecordTransfer() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<
    z.infer<typeof RecordTransferResultSchema>,
    Error,
    { invoiceId: string; reference: string }
  >({
    mutationFn: ({ invoiceId, reference }) =>
      client.send(
        "POST",
        `/invoices/${encodeURIComponent(invoiceId)}/record-transfer`,
        { reference },
        RecordTransferResultSchema,
      ),
    onSuccess: async () => {
      await Promise.all(
        ["/invoices", "/payments", "/dunning", "/subscriptions"].map((path) =>
          qc.invalidateQueries({ queryKey: ["control", staffId, path] }),
        ),
      );
    },
  });
}
