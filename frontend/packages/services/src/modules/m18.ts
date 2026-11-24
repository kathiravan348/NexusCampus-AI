import {
  ConcessionSchema,
  FeeHeadSchema,
  FeeInvoiceSchema,
  FeePaymentSchema,
  FeePlanSchema,
  FeeRefundSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type FeeInvoiceStatus,
  type FeePayment,
  type FeePaymentInput,
} from "@nexus/contracts";
import { listOutbox, subscribeOutbox, type OutboxEntry } from "@nexus/offline";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery, useServices } from "../query";

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

export type RecordFeePaymentVars = Omit<FeePaymentInput, "deviceId"> & {
  readonly deviceId?: string | null;
};

export interface PendingFeePayment {
  readonly entryId: string;
  readonly status: OutboxEntry["status"];
  readonly deviceId: string;
  readonly input: FeePaymentInput;
}

const FEE_PAYMENT_OP = "fees.payment";

/** Records a manual fee receipt (M18, L2 offline outbox) and invalidates M18 queries on sync. */
export function useRecordFeePayment() {
  const { db, scope } = useServices();
  const qc = useQueryClient();
  const [pendingPayments, setPendingPayments] = useState<readonly PendingFeePayment[]>([]);
  const [replayFailed, setReplayFailed] = useState(false);

  useEffect(() => {
    if (!scope) {
      setPendingPayments([]);
      setReplayFailed(false);
      return;
    }
    let active = true;
    const load = () => {
      void listOutbox(db, scope)
        .then((entries) => {
          if (!active) return;
          const mine = entries.filter(
            (entry) => entry.moduleId === "M18" && entry.operation === FEE_PAYMENT_OP,
          );
          setPendingPayments(
            mine
              .filter((entry) => entry.status === "pending" || entry.status === "syncing")
              .map((entry) => ({
                entryId: entry.id,
                status: entry.status,
                deviceId: entry.deviceId,
                input: { ...(entry.payload as RecordFeePaymentVars), deviceId: entry.deviceId },
              })),
          );
          setReplayFailed(mine.some((entry) => entry.status === "failed"));
        })
        .catch(() => undefined);
    };
    load();
    const unsubscribe = subscribeOutbox(db, scope, load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [db, scope]);

  const mutation = useOutboxMutation<RecordFeePaymentVars, FeePayment>({
    moduleId: "M18",
    operation: FEE_PAYMENT_OP,
    mergeRule: "append-only",
    priority: "high",
    send: async (client, input, idempotencyKey) => {
      const queued = scope
        ? (await listOutbox(db, scope)).find((entry) => entry.idempotencyKey === idempotencyKey)
        : undefined;
      const body: FeePaymentInput = {
        invoiceIds: input.invoiceIds,
        currency: input.currency,
        amount: input.amount,
        method: input.method,
        receivedAt: input.receivedAt,
        deviceId: queued ? queued.deviceId : null,
      };
      const payment = await client.send("POST", "/fee-payments", body, FeePaymentSchema, {
        headers: idempotencyHeaders(idempotencyKey),
      });
      if (scope) {
        await qc.invalidateQueries({ queryKey: queryKeys.m18.feeHeads(scope).slice(0, -1) });
      }
      return payment;
    },
  });

  return { ...mutation, pendingPayments, replayFailed };
}
