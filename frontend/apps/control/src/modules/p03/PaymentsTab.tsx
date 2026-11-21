import type { Payment } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useInvoices, usePayments } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { GATEWAY_KEY, METHOD_KEY, PAY_STATUS } from "./labels";

/** Payments received: gateway and its reference only — never card or bank numbers. */
export function PaymentsTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const payments = usePayments();
  const invoices = useInvoices();
  const numbers = useMemo(
    () => new Map((invoices.data?.items ?? []).map((i) => [i.id, i.number])),
    [invoices.data],
  );

  const columns = useMemo<DataTableProps<Payment>["columns"]>(
    () => [
      {
        id: "invoice",
        header: t("p03.pay.invoice"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="font-mono">
            {numbers.get(row.original.invoiceId) ?? row.original.invoiceId}
          </span>
        ),
      },
      {
        id: "method",
        header: t("p03.pay.method"),
        enableSorting: false,
        cell: ({ row }) => t(METHOD_KEY[row.original.method]),
      },
      {
        id: "gateway",
        header: t("p03.pay.gateway"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>{t(GATEWAY_KEY[row.original.gateway])}</span>
            {row.original.gatewayRef && (
              <span className="font-mono text-body-sm text-text-secondary">
                {row.original.gatewayRef}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: t("p03.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = PAY_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "amount",
        accessorKey: "amountMinor",
        header: t("p03.pay.amount"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.amountMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "date",
        accessorKey: "createdAt",
        header: t("p03.pay.date"),
        cell: ({ row }) => fmt.date(row.original.createdAt),
      },
    ],
    [t, fmt, numbers],
  );

  return (
    <DataTable
      caption={t("p03.pay.caption")}
      columns={columns}
      data={payments.data?.items ?? []}
      getRowId={(p) => p.id}
      loading={payments.isPending}
      error={payments.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
