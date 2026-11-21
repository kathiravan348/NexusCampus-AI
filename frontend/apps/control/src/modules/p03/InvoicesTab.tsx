import type { Invoice } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useInvoices, useStaffCan } from "@nexus/services/control";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { INV_STATUS } from "./labels";
import { RecordTransferModal } from "./RecordTransferModal";

export function InvoicesTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const can = useStaffCan();
  const invoices = useInvoices();
  const accounts = useAccountNames();
  const [recording, setRecording] = useState<Invoice | null>(null);
  const canRecord = can("ctl.billing.manage");

  const columns = useMemo<DataTableProps<Invoice>["columns"]>(
    () => [
      {
        id: "number",
        accessorKey: "number",
        header: t("p03.inv.number"),
        meta: { primary: true },
        cell: ({ row }) => <span className="font-mono">{row.original.number}</span>,
      },
      {
        id: "account",
        header: t("p03.col.account"),
        enableSorting: false,
        cell: ({ row }) => accounts.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "status",
        header: t("p03.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = INV_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "dates",
        header: t("p03.inv.dates"),
        enableSorting: false,
        cell: ({ row }) =>
          t("p03.inv.dateRange", {
            issued: fmt.date(row.original.issueDate),
            due: fmt.date(row.original.dueDate),
          }),
      },
      {
        id: "tax",
        header: t("p03.inv.tax"),
        enableSorting: false,
        cell: ({ row }) => {
          const i = row.original;
          if (i.taxScheme === "none") return t("p03.tax.none");
          const amount = fmt.money(i.taxMinor, i.currency);
          return t(i.taxScheme === "gst" ? "p03.tax.gst" : "p03.tax.vat", { amount });
        },
      },
      {
        id: "total",
        accessorKey: "totalMinor",
        header: t("p03.inv.total"),
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {fmt.money(row.original.totalMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          canRecord && (row.original.status === "open" || row.original.status === "overdue") ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={t("p03.inv.recordLabel", { number: row.original.number })}
              onClick={() => setRecording(row.original)}
            >
              {t("p03.inv.record")}
            </Button>
          ) : null,
      },
    ],
    [t, fmt, accounts, canRecord],
  );

  return (
    <>
      <DataTable
        caption={t("p03.inv.caption")}
        columns={columns}
        data={invoices.data?.items ?? []}
        getRowId={(i) => i.id}
        loading={invoices.isPending}
        error={invoices.isError ? <EmptyState tone="error" /> : undefined}
      />
      {recording && (
        <RecordTransferModal
          invoice={recording}
          accountName={accounts.get(recording.accountId) ?? recording.accountId}
          onClose={() => setRecording(null)}
        />
      )}
    </>
  );
}
